-- CreateTable
CREATE TABLE `usuarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(180) NOT NULL,
    `nombre` VARCHAR(160) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `rol` ENUM('ADMIN', 'ABOGADO', 'SECRETARIA', 'LECTURA') NOT NULL DEFAULT 'LECTURA',
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `intentosFallidos` INTEGER NOT NULL DEFAULT 0,
    `bloqueadoHasta` DATETIME(3) NULL,
    `ultimoLoginEn` DATETIME(3) NULL,
    `abogadoId` INTEGER NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado` DATETIME(3) NOT NULL,
    `eliminadoEn` DATETIME(3) NULL,

    UNIQUE INDEX `usuarios_email_key`(`email`),
    UNIQUE INDEX `usuarios_abogadoId_key`(`abogadoId`),
    INDEX `usuarios_rol_idx`(`rol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tokenHash` VARCHAR(64) NOT NULL,
    `familia` VARCHAR(64) NOT NULL,
    `usuarioId` INTEGER NOT NULL,
    `expiraEn` DATETIME(3) NOT NULL,
    `usadoEn` DATETIME(3) NULL,
    `revocadoEn` DATETIME(3) NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` VARCHAR(255) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_tokenHash_key`(`tokenHash`),
    INDEX `refresh_tokens_usuarioId_idx`(`usuarioId`),
    INDEX `refresh_tokens_familia_idx`(`familia`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuarioId` INTEGER NULL,
    `entidad` VARCHAR(60) NOT NULL,
    `entidadId` INTEGER NULL,
    `accion` ENUM('CREAR', 'ACTUALIZAR', 'ELIMINAR', 'RESTAURAR', 'LOGIN', 'LOGIN_FALLIDO', 'LOGOUT', 'DESCARGA') NOT NULL,
    `campo` VARCHAR(60) NULL,
    `valorAnterior` TEXT NULL,
    `valorNuevo` TEXT NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` VARCHAR(255) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_log_entidad_entidadId_idx`(`entidad`, `entidadId`),
    INDEX `audit_log_usuarioId_idx`(`usuarioId`),
    INDEX `audit_log_creadoEn_idx`(`creadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `config_estudio` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `nombreEstudio` VARCHAR(160) NOT NULL,
    `titular` VARCHAR(160) NULL,
    `matricula` VARCHAR(60) NULL,
    `cuit` VARCHAR(20) NULL,
    `domicilio` VARCHAR(200) NULL,
    `localidad` VARCHAR(120) NULL,
    `telefono` VARCHAR(60) NULL,
    `email` VARCHAR(180) NULL,
    `anioTrabajo` INTEGER NOT NULL DEFAULT 2026,
    `diasPorVencer` INTEGER NOT NULL DEFAULT 7,
    `ventanaProximos` INTEGER NOT NULL DEFAULT 30,
    `valorJus` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `jurisdiccionDefault` VARCHAR(60) NOT NULL DEFAULT 'NACION',
    `mesesCaducidadDefault` INTEGER NOT NULL DEFAULT 6,
    `actualizado` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `catalogo_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tipo` ENUM('PROVINCIA', 'FUERO', 'ETAPA_PROCESAL', 'ESTADO_EXPEDIENTE', 'JUZGADO', 'ORIGEN_CONTACTO', 'TIPO_EVENTO', 'TIPO_EVENTO_RECURRENTE', 'MEDIO_PAGO', 'RUBRO_GASTO') NOT NULL,
    `valor` VARCHAR(160) NOT NULL,
    `orden` INTEGER NOT NULL DEFAULT 0,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `scope` VARCHAR(20) NULL,
    `computaComoActivo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `catalogo_items_tipo_activo_orden_idx`(`tipo`, `activo`, `orden`),
    UNIQUE INDEX `catalogo_items_tipo_valor_key`(`tipo`, `valor`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `abogados` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(160) NOT NULL,
    `matricula` VARCHAR(60) NULL,
    `email` VARCHAR(180) NULL,
    `telefono` VARCHAR(60) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `abogados_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `clientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(20) NOT NULL,
    `tipoPersona` ENUM('FISICA', 'JURIDICA') NOT NULL,
    `nombre` VARCHAR(200) NOT NULL,
    `documento` VARCHAR(20) NULL,
    `fechaNacConstit` DATE NULL,
    `domicilio` VARCHAR(200) NULL,
    `provinciaId` INTEGER NULL,
    `telefono` VARCHAR(60) NULL,
    `email` VARCHAR(180) NULL,
    `origenId` INTEGER NULL,
    `estado` ENUM('ACTIVO', 'POTENCIAL', 'INACTIVO', 'EX_CLIENTE') NOT NULL DEFAULT 'ACTIVO',
    `fechaAlta` DATE NOT NULL,
    `abogadoId` INTEGER NULL,
    `observaciones` TEXT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado` DATETIME(3) NOT NULL,
    `eliminadoEn` DATETIME(3) NULL,

    UNIQUE INDEX `clientes_codigo_key`(`codigo`),
    INDEX `clientes_nombre_idx`(`nombre`),
    INDEX `clientes_estado_idx`(`estado`),
    INDEX `clientes_abogadoId_idx`(`abogadoId`),
    INDEX `clientes_eliminadoEn_idx`(`eliminadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `expedientes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(20) NOT NULL,
    `fechaInicio` DATE NOT NULL,
    `caratula` VARCHAR(300) NOT NULL,
    `clienteId` INTEGER NOT NULL,
    `caracter` ENUM('ACTOR', 'DEMANDADO', 'TERCERO', 'QUERELLANTE', 'CONSULTANTE') NOT NULL,
    `contraparte` VARCHAR(200) NULL,
    `fueroId` INTEGER NULL,
    `juzgadoId` INTEGER NULL,
    `numeroExpediente` VARCHAR(80) NULL,
    `etapaId` INTEGER NULL,
    `estadoId` INTEGER NULL,
    `abogadoId` INTEGER NULL,
    `ultimaActuacion` DATE NULL,
    `montoReclamado` DECIMAL(14, 2) NULL,
    `mesesCaducidad` INTEGER NULL,
    `fechaPrescripcion` DATE NULL,
    `observaciones` TEXT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado` DATETIME(3) NOT NULL,
    `eliminadoEn` DATETIME(3) NULL,

    UNIQUE INDEX `expedientes_codigo_key`(`codigo`),
    INDEX `expedientes_clienteId_idx`(`clienteId`),
    INDEX `expedientes_abogadoId_idx`(`abogadoId`),
    INDEX `expedientes_caratula_idx`(`caratula`),
    INDEX `expedientes_estadoId_idx`(`estadoId`),
    INDEX `expedientes_eliminadoEn_idx`(`eliminadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `eventos_puntuales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(20) NOT NULL,
    `fechaVto` DATE NOT NULL,
    `hora` VARCHAR(5) NULL,
    `tipoId` INTEGER NULL,
    `descripcion` VARCHAR(300) NOT NULL,
    `expedienteId` INTEGER NULL,
    `responsableId` INTEGER NULL,
    `prioridad` ENUM('ALTA', 'MEDIA', 'BAJA') NOT NULL DEFAULT 'MEDIA',
    `estado` ENUM('PENDIENTE', 'EN_CURSO', 'CUMPLIDO', 'REPROGRAMADO', 'CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
    `observaciones` TEXT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado` DATETIME(3) NOT NULL,
    `eliminadoEn` DATETIME(3) NULL,

    UNIQUE INDEX `eventos_puntuales_codigo_key`(`codigo`),
    INDEX `eventos_puntuales_fechaVto_estado_idx`(`fechaVto`, `estado`),
    INDEX `eventos_puntuales_expedienteId_idx`(`expedienteId`),
    INDEX `eventos_puntuales_responsableId_idx`(`responsableId`),
    INDEX `eventos_puntuales_eliminadoEn_idx`(`eliminadoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `eventos_recurrentes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(20) NOT NULL,
    `descripcion` VARCHAR(300) NOT NULL,
    `tipoId` INTEGER NULL,
    `periodicidad` ENUM('SEMANAL', 'QUINCENAL', 'MENSUAL', 'BIMESTRAL', 'TRIMESTRAL', 'CUATRIMESTRAL', 'SEMESTRAL', 'ANUAL') NOT NULL,
    `fechaBase` DATE NOT NULL,
    `responsableId` INTEGER NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `observaciones` TEXT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado` DATETIME(3) NOT NULL,
    `eliminadoEn` DATETIME(3) NULL,

    UNIQUE INDEX `eventos_recurrentes_codigo_key`(`codigo`),
    INDEX `eventos_recurrentes_activo_idx`(`activo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recurrente_cumplimientos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recurrenteId` INTEGER NOT NULL,
    `periodoClave` VARCHAR(20) NOT NULL,
    `cumplidoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cumplidoPor` VARCHAR(160) NULL,
    `observacion` VARCHAR(300) NULL,

    INDEX `recurrente_cumplimientos_periodoClave_idx`(`periodoClave`),
    UNIQUE INDEX `recurrente_cumplimientos_recurrenteId_periodoClave_key`(`recurrenteId`, `periodoClave`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `honorarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(20) NOT NULL,
    `clienteId` INTEGER NOT NULL,
    `expedienteId` INTEGER NULL,
    `fechaPacto` DATE NOT NULL,
    `tipoPacto` ENUM('MONTO_FIJO', 'POR_ETAPAS', 'CUOTA_LITIS', 'POR_HORA', 'ABONO_MENSUAL') NOT NULL,
    `montoPactado` DECIMAL(14, 2) NOT NULL,
    `ivaPorcentaje` DECIMAL(5, 2) NOT NULL DEFAULT 21,
    `observaciones` TEXT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado` DATETIME(3) NOT NULL,
    `eliminadoEn` DATETIME(3) NULL,

    UNIQUE INDEX `honorarios_codigo_key`(`codigo`),
    INDEX `honorarios_clienteId_idx`(`clienteId`),
    INDEX `honorarios_expedienteId_idx`(`expedienteId`),
    INDEX `honorarios_fechaPacto_idx`(`fechaPacto`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `honorario_pagos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `honorarioId` INTEGER NOT NULL,
    `fecha` DATE NOT NULL,
    `monto` DECIMAL(14, 2) NOT NULL,
    `medioPagoId` INTEGER NULL,
    `observacion` VARCHAR(300) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `honorario_pagos_honorarioId_idx`(`honorarioId`),
    INDEX `honorario_pagos_fecha_idx`(`fecha`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gastos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `codigo` VARCHAR(20) NOT NULL,
    `fecha` DATE NOT NULL,
    `tipo` ENUM('EXPEDIENTE', 'ESTUDIO') NOT NULL,
    `expedienteId` INTEGER NULL,
    `rubroId` INTEGER NULL,
    `detalle` VARCHAR(300) NULL,
    `medioPagoId` INTEGER NULL,
    `importe` DECIMAL(14, 2) NOT NULL,
    `reembolsable` BOOLEAN NOT NULL DEFAULT false,
    `estadoReintegro` ENUM('PENDIENTE', 'REINTEGRADO', 'NO_CORRESPONDE') NOT NULL DEFAULT 'NO_CORRESPONDE',
    `observaciones` TEXT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado` DATETIME(3) NOT NULL,
    `eliminadoEn` DATETIME(3) NULL,

    UNIQUE INDEX `gastos_codigo_key`(`codigo`),
    INDEX `gastos_fecha_idx`(`fecha`),
    INDEX `gastos_tipo_idx`(`tipo`),
    INDEX `gastos_expedienteId_idx`(`expedienteId`),
    INDEX `gastos_estadoReintegro_idx`(`estadoReintegro`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feriados` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fecha` DATE NOT NULL,
    `descripcion` VARCHAR(160) NOT NULL,
    `jurisdiccion` VARCHAR(60) NOT NULL DEFAULT 'NACION',

    INDEX `feriados_fecha_idx`(`fecha`),
    UNIQUE INDEX `feriados_fecha_jurisdiccion_key`(`fecha`, `jurisdiccion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ferias_judiciales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `desde` DATE NOT NULL,
    `hasta` DATE NOT NULL,
    `descripcion` VARCHAR(160) NOT NULL,
    `jurisdiccion` VARCHAR(60) NOT NULL DEFAULT 'NACION',

    INDEX `ferias_judiciales_desde_hasta_idx`(`desde`, `hasta`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plazo_tipos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(160) NOT NULL,
    `dias` INTEGER NOT NULL,
    `computo` ENUM('HABILES', 'CORRIDOS') NOT NULL DEFAULT 'HABILES',
    `fueroId` INTEGER NULL,
    `descripcion` VARCHAR(300) NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `plazo_tipos_nombre_fueroId_key`(`nombre`, `fueroId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `adjuntos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entidadTipo` ENUM('EXPEDIENTE', 'EVENTO', 'CLIENTE', 'GASTO') NOT NULL,
    `entidadId` INTEGER NOT NULL,
    `nombreOriginal` VARCHAR(255) NOT NULL,
    `nombreArchivo` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(120) NOT NULL,
    `tamanoBytes` INTEGER NOT NULL,
    `hash` VARCHAR(64) NOT NULL,
    `subidoPorId` INTEGER NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `eliminadoEn` DATETIME(3) NULL,

    UNIQUE INDEX `adjuntos_nombreArchivo_key`(`nombreArchivo`),
    INDEX `adjuntos_entidadTipo_entidadId_idx`(`entidadTipo`, `entidadId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notificaciones` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuarioId` INTEGER NOT NULL,
    `tipo` ENUM('VENCIMIENTO', 'CADUCIDAD', 'PRESCRIPCION', 'SISTEMA') NOT NULL,
    `titulo` VARCHAR(200) NOT NULL,
    `mensaje` TEXT NOT NULL,
    `entidadTipo` VARCHAR(60) NULL,
    `entidadId` INTEGER NULL,
    `claveDedupe` VARCHAR(180) NOT NULL,
    `leidaEn` DATETIME(3) NULL,
    `creadoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notificaciones_usuarioId_leidaEn_idx`(`usuarioId`, `leidaEn`),
    UNIQUE INDEX `notificaciones_usuarioId_claveDedupe_key`(`usuarioId`, `claveDedupe`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `usuarios` ADD CONSTRAINT `usuarios_abogadoId_fkey` FOREIGN KEY (`abogadoId`) REFERENCES `abogados`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clientes` ADD CONSTRAINT `clientes_provinciaId_fkey` FOREIGN KEY (`provinciaId`) REFERENCES `catalogo_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clientes` ADD CONSTRAINT `clientes_origenId_fkey` FOREIGN KEY (`origenId`) REFERENCES `catalogo_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `clientes` ADD CONSTRAINT `clientes_abogadoId_fkey` FOREIGN KEY (`abogadoId`) REFERENCES `abogados`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expedientes` ADD CONSTRAINT `expedientes_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `clientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expedientes` ADD CONSTRAINT `expedientes_fueroId_fkey` FOREIGN KEY (`fueroId`) REFERENCES `catalogo_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expedientes` ADD CONSTRAINT `expedientes_juzgadoId_fkey` FOREIGN KEY (`juzgadoId`) REFERENCES `catalogo_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expedientes` ADD CONSTRAINT `expedientes_etapaId_fkey` FOREIGN KEY (`etapaId`) REFERENCES `catalogo_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expedientes` ADD CONSTRAINT `expedientes_estadoId_fkey` FOREIGN KEY (`estadoId`) REFERENCES `catalogo_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expedientes` ADD CONSTRAINT `expedientes_abogadoId_fkey` FOREIGN KEY (`abogadoId`) REFERENCES `abogados`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eventos_puntuales` ADD CONSTRAINT `eventos_puntuales_tipoId_fkey` FOREIGN KEY (`tipoId`) REFERENCES `catalogo_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eventos_puntuales` ADD CONSTRAINT `eventos_puntuales_expedienteId_fkey` FOREIGN KEY (`expedienteId`) REFERENCES `expedientes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eventos_puntuales` ADD CONSTRAINT `eventos_puntuales_responsableId_fkey` FOREIGN KEY (`responsableId`) REFERENCES `abogados`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eventos_recurrentes` ADD CONSTRAINT `eventos_recurrentes_tipoId_fkey` FOREIGN KEY (`tipoId`) REFERENCES `catalogo_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eventos_recurrentes` ADD CONSTRAINT `eventos_recurrentes_responsableId_fkey` FOREIGN KEY (`responsableId`) REFERENCES `abogados`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recurrente_cumplimientos` ADD CONSTRAINT `recurrente_cumplimientos_recurrenteId_fkey` FOREIGN KEY (`recurrenteId`) REFERENCES `eventos_recurrentes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `honorarios` ADD CONSTRAINT `honorarios_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `clientes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `honorarios` ADD CONSTRAINT `honorarios_expedienteId_fkey` FOREIGN KEY (`expedienteId`) REFERENCES `expedientes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `honorario_pagos` ADD CONSTRAINT `honorario_pagos_honorarioId_fkey` FOREIGN KEY (`honorarioId`) REFERENCES `honorarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `honorario_pagos` ADD CONSTRAINT `honorario_pagos_medioPagoId_fkey` FOREIGN KEY (`medioPagoId`) REFERENCES `catalogo_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gastos` ADD CONSTRAINT `gastos_expedienteId_fkey` FOREIGN KEY (`expedienteId`) REFERENCES `expedientes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gastos` ADD CONSTRAINT `gastos_rubroId_fkey` FOREIGN KEY (`rubroId`) REFERENCES `catalogo_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gastos` ADD CONSTRAINT `gastos_medioPagoId_fkey` FOREIGN KEY (`medioPagoId`) REFERENCES `catalogo_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plazo_tipos` ADD CONSTRAINT `plazo_tipos_fueroId_fkey` FOREIGN KEY (`fueroId`) REFERENCES `catalogo_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `adjuntos` ADD CONSTRAINT `adjuntos_subidoPorId_fkey` FOREIGN KEY (`subidoPorId`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notificaciones` ADD CONSTRAINT `notificaciones_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
