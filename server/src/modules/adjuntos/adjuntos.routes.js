/**
 * ADJUNTOS: escritos, cedulas, comprobantes.
 *
 * Decisiones de seguridad, todas deliberadas:
 *  - Los archivos se guardan FUERA del webroot, en un directorio que no sirve
 *    ningun servidor estatico. La unica forma de llegar a ellos es este
 *    endpoint, que verifica sesion y permisos.
 *  - El nombre en disco lo genera el servidor (uuid + extension de la lista
 *    blanca). El nombre original del usuario se guarda en la base como dato,
 *    nunca se usa para escribir en el filesystem: es la defensa contra
 *    "../../etc/passwd" y contra nombres con caracteres raros.
 *  - Lista blanca de tipos y tope de tamano.
 *  - La descarga se sirve como adjunto (Content-Disposition: attachment) para
 *    que un HTML subido no pueda ejecutarse en el dominio de la aplicacion.
 *  - Cada descarga queda auditada: los adjuntos pueden tener datos sensibles.
 */
import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { validar, idParam } from '../../middlewares/validar.js';
import { autorizar } from '../../middlewares/autorizar.js';
import { limiteSubida } from '../../middlewares/limites.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok, creado } from '../../utils/respuesta.js';
import { registrarAccion } from '../../services/auditoria.service.js';

const router = Router();

const DIRECTORIO = path.resolve(env.UPLOAD_DIR);

// Se crea al arrancar, no en cada subida.
fs.mkdirSync(DIRECTORIO, { recursive: true });

/** Lista blanca: extension -> mime esperado. */
const TIPOS_PERMITIDOS = {
  '.pdf': ['application/pdf'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.odt': ['application/vnd.oasis.opendocument.text'],
  '.txt': ['text/plain'],
};

const ENTIDADES = ['EXPEDIENTE', 'EVENTO', 'CLIENTE', 'GASTO'];

const almacenamiento = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DIRECTORIO),
  filename: (req, file, cb) => {
    // El nombre en disco NO deriva del que mando el usuario.
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomUUID() + ext);
  },
});

const subida = multer({
  storage: almacenamiento,
  limits: {
    fileSize: env.MAX_UPLOAD_MB * 1024 * 1024,
    files: 1,
    // Tope de campos: evita un multipart con miles de campos como DoS.
    fields: 10,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimesEsperados = TIPOS_PERMITIDOS[ext];

    if (!mimesEsperados) {
      return cb(
        ApiError.badRequest(
          'Tipo de archivo no permitido. Se aceptan: ' + Object.keys(TIPOS_PERMITIDOS).join(', ')
        )
      );
    }
    // Se exige que la extension y el mime declarado coincidan: no alcanza para
    // todo, pero descarta el caso obvio de renombrar un .exe a .pdf.
    if (!mimesEsperados.includes(file.mimetype)) {
      return cb(ApiError.badRequest('La extension del archivo no coincide con su contenido'));
    }
    return cb(null, true);
  },
});

/** Verifica que la entidad a la que se adjunta exista. */
async function verificarEntidad(tipo, id) {
  const mapa = {
    EXPEDIENTE: () => prisma.expediente.findFirst({ where: { id, eliminadoEn: null } }),
    EVENTO: () => prisma.eventoPuntual.findFirst({ where: { id, eliminadoEn: null } }),
    CLIENTE: () => prisma.cliente.findFirst({ where: { id, eliminadoEn: null } }),
    GASTO: () => prisma.gasto.findFirst({ where: { id, eliminadoEn: null } }),
  };
  const registro = await mapa[tipo]();
  if (!registro) throw ApiError.badRequest('El registro al que se quiere adjuntar no existe');
  return registro;
}

/** SHA-256 del archivo ya guardado: detecta duplicados y corrupcion. */
async function hashDeArchivo(ruta) {
  const contenido = await fsp.readFile(ruta);
  return crypto.createHash('sha256').update(contenido).digest('hex');
}

const esquemaEntidad = z.object({
  entidadTipo: z.enum(ENTIDADES),
  entidadId: z.coerce.number().int().positive(),
});

router.get(
  '/',
  autorizar('adjuntos:leer'),
  validar({ query: esquemaEntidad }),
  asyncHandler(async (req, res) => {
    const items = await prisma.adjunto.findMany({
      where: {
        entidadTipo: req.datosQuery.entidadTipo,
        entidadId: req.datosQuery.entidadId,
        eliminadoEn: null,
      },
      include: { subidoPor: { select: { nombre: true } } },
      orderBy: { creadoEn: 'desc' },
    });

    return ok(
      res,
      items.map((a) => ({
        id: a.id,
        nombreOriginal: a.nombreOriginal,
        mimeType: a.mimeType,
        tamanoBytes: a.tamanoBytes,
        subidoPor: a.subidoPor ? a.subidoPor.nombre : null,
        creadoEn: a.creadoEn.toISOString(),
      }))
    );
  })
);

router.post(
  '/',
  autorizar('adjuntos:escribir'),
  limiteSubida,
  subida.single('archivo'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw ApiError.badRequest('No se recibio ningun archivo');

    // La validacion del cuerpo va DESPUES de multer porque los campos del
    // multipart no existen hasta que multer los parsea. Si falla, hay que
    // borrar el archivo que ya quedo en disco.
    const parseo = esquemaEntidad.safeParse(req.body);
    if (!parseo.success) {
      await fsp.unlink(req.file.path).catch(() => {});
      throw ApiError.badRequest('Falta indicar a que registro se adjunta el archivo');
    }

    try {
      await verificarEntidad(parseo.data.entidadTipo, parseo.data.entidadId);
    } catch (err) {
      await fsp.unlink(req.file.path).catch(() => {});
      throw err;
    }

    const hash = await hashDeArchivo(req.file.path);

    const adjunto = await prisma.$transaction(async (tx) => {
      const nuevo = await tx.adjunto.create({
        data: {
          entidadTipo: parseo.data.entidadTipo,
          entidadId: parseo.data.entidadId,
          // Se guarda el nombre original solo como dato para mostrar, ya
          // recortado. Nunca se usa para operaciones de filesystem.
          nombreOriginal: path.basename(req.file.originalname).slice(0, 255),
          nombreArchivo: req.file.filename,
          mimeType: req.file.mimetype,
          tamanoBytes: req.file.size,
          hash,
          subidoPorId: req.usuario.id,
        },
      });
      await registrarAccion({
        tx,
        req,
        entidad: 'Adjunto',
        entidadId: nuevo.id,
        accion: 'CREAR',
        valorNuevo:
          nuevo.nombreOriginal + ' -> ' + parseo.data.entidadTipo + ' #' + parseo.data.entidadId,
      });
      return nuevo;
    });

    return creado(res, {
      id: adjunto.id,
      nombreOriginal: adjunto.nombreOriginal,
      tamanoBytes: adjunto.tamanoBytes,
      mimeType: adjunto.mimeType,
    });
  })
);

router.get(
  '/:id/descargar',
  autorizar('adjuntos:leer'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => {
    const adjunto = await prisma.adjunto.findUnique({ where: { id: req.params.id } });
    if (!adjunto || adjunto.eliminadoEn) throw ApiError.noEncontrado('El adjunto no existe');

    const ruta = path.resolve(DIRECTORIO, adjunto.nombreArchivo);
    // Defensa en profundidad: aunque el nombre lo genera el servidor, se
    // verifica que la ruta resuelta siga cayendo dentro del directorio.
    if (!ruta.startsWith(DIRECTORIO + path.sep)) {
      throw ApiError.prohibido('Ruta de archivo invalida');
    }
    if (!fs.existsSync(ruta)) {
      throw ApiError.noEncontrado('El archivo ya no esta disponible en el servidor');
    }

    await registrarAccion({
      req,
      entidad: 'Adjunto',
      entidadId: adjunto.id,
      accion: 'DESCARGA',
      valorNuevo: adjunto.nombreOriginal,
    });

    // Siempre como adjunto: un HTML o SVG subido no debe poder ejecutarse en
    // el dominio de la app.
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="' + adjunto.nombreOriginal.replace(/["\\]/g, '') + '"'
    );
    return res.sendFile(ruta);
  })
);

router.delete(
  '/:id',
  autorizar('adjuntos:eliminar'),
  validar({ params: idParam }),
  asyncHandler(async (req, res) => {
    const adjunto = await prisma.adjunto.findUnique({ where: { id: req.params.id } });
    if (!adjunto || adjunto.eliminadoEn) throw ApiError.noEncontrado('El adjunto no existe');

    // Baja logica en la base y borrado fisico del archivo. El registro queda
    // para que la auditoria pueda decir que existio y quien lo borro.
    await prisma.$transaction(async (tx) => {
      await tx.adjunto.update({ where: { id: req.params.id }, data: { eliminadoEn: new Date() } });
      await registrarAccion({
        tx,
        req,
        entidad: 'Adjunto',
        entidadId: req.params.id,
        accion: 'ELIMINAR',
        valorAnterior: adjunto.nombreOriginal,
      });
    });

    await fsp.unlink(path.resolve(DIRECTORIO, adjunto.nombreArchivo)).catch(() => {});

    return ok(res, { id: req.params.id });
  })
);

export default router;
