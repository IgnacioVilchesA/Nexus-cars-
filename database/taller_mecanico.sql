CREATE DATABASE IF NOT EXISTS `taller_mecanico` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `taller_mecanico`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'mecanico', 'recepcionista', 'cliente') NOT NULL DEFAULT 'cliente',
  `rut` VARCHAR(12) NULL,
  `phone` VARCHAR(15) NULL,
  `alternate_phone` VARCHAR(15) NULL,
  `data_consent` TINYINT(1) NOT NULL DEFAULT 0,
  `consent_at` DATETIME NULL,
  `force_password_change` TINYINT(1) NOT NULL DEFAULT 0,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `failed_login_attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `locked_until` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_rut` (`rut`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `vehicles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `owner_id` INT NOT NULL,
  `type` ENUM('Auto', 'Moto') NOT NULL,
  `brand` VARCHAR(50) NOT NULL,
  `model` VARCHAR(80) NOT NULL,
  `plate` VARCHAR(20) NOT NULL,
  `year` SMALLINT NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_vehicles_plate` (`plate`),
  KEY `idx_vehicles_owner_id` (`owner_id`),
  CONSTRAINT `fk_vehicles_users` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `work_orders` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `client_id` INT NOT NULL,
  `vehicle_id` INT NOT NULL,
  `description` TEXT NOT NULL,
  `status` ENUM('solicitada', 'recibido', 'diagnóstico', 'en_diagnostico', 'cotizacion_pendiente', 'cotizacion_aprobada', 'reparación', 'en_reparacion', 'esperando_aprobacion', 'trabajo_terminado', 'listo', 'listo_para_entrega', 'entregado', 'cerrado', 'cancelado') NOT NULL DEFAULT 'solicitada',
  `entry_mileage` INT NULL,
  `fuel_level` VARCHAR(20) NULL,
  `reception_notes` TEXT NULL,
  `damages` TEXT NULL,
  `left_items` TEXT NULL,
  `reception_photos` JSON NULL,
  `estimated_date` VARCHAR(30) NULL,
  `appointment_at` DATETIME NULL,
  `mechanic_id` INT NULL,
  `recepcionista_id` INT NULL,
  `assigned_mechanic` VARCHAR(120) NULL,
  `total_final` DECIMAL(12,2) NULL,
  `quote_total` DECIMAL(12,2) NULL,
  `quote_version` INT NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `next_maintenance` VARCHAR(50) NOT NULL DEFAULT 'Por definir',
  `quote_status` ENUM('pendiente', 'aprobado', 'rechazado', 'modificada', 'reemplazada', 'cancelada') NOT NULL DEFAULT 'pendiente',
  PRIMARY KEY (`id`),
  KEY `idx_work_orders_client_id` (`client_id`),
  KEY `idx_work_orders_vehicle_id` (`vehicle_id`),
  CONSTRAINT `fk_work_orders_users` FOREIGN KEY (`client_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_work_orders_vehicles` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `work_order_quotes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `subtotal` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `descuento` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `total_estimado` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `motivo_modificacion` VARCHAR(255) NULL,
  `estado` ENUM('pendiente', 'aprobado', 'rechazado', 'modificada', 'reemplazada', 'cancelada') NOT NULL DEFAULT 'pendiente',
  `creado_por` INT NOT NULL,
  `observaciones` TEXT NULL,
  `fecha_creacion` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_respuesta` TIMESTAMP NULL,
  `aprobado_por` VARCHAR(120) NULL,
  `medio_respuesta` VARCHAR(20) NULL,
  `motivo_rechazo` TEXT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_quotes_order_id` (`order_id`),
  CONSTRAINT `fk_quotes_orders` FOREIGN KEY (`order_id`) REFERENCES `work_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `work_order_additional_works` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `mecanico_id` INT NOT NULL,
  `descripcion` TEXT NOT NULL,
  `motivo` TEXT NOT NULL,
  `observaciones` TEXT NULL,
  `costo_estimado` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `estado` ENUM('PENDIENTE_REVISION', 'PENDIENTE_APROBACION', 'APROBADO', 'RECHAZADO', 'REALIZADO', 'CANCELADO') NOT NULL DEFAULT 'PENDIENTE_REVISION',
  `fecha` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_additional_works_order_id` (`order_id`),
  CONSTRAINT `fk_additional_works_orders` FOREIGN KEY (`order_id`) REFERENCES `work_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `work_order_history` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `usuario_id` INT NOT NULL,
  `accion` VARCHAR(100) NOT NULL,
  `descripcion` TEXT NOT NULL,
  `estado_anterior` VARCHAR(50) NULL,
  `estado_nuevo` VARCHAR(50) NULL,
  `fecha` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_history_order_id` (`order_id`),
  CONSTRAINT `fk_history_orders` FOREIGN KEY (`order_id`) REFERENCES `work_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NULL,
  `action` VARCHAR(50) NOT NULL,
  `entity` VARCHAR(50) NOT NULL,
  `entity_id` INT NULL,
  `detail` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_entity` (`entity`, `entity_id`),
  KEY `idx_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `work_order_services` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `order_id` INT NOT NULL,
  `service_name` VARCHAR(150) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_work_order_services_order_id` (`order_id`),
  CONSTRAINT `fk_work_order_services_orders` FOREIGN KEY (`order_id`) REFERENCES `work_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `work_order_mechanic_data` (
  `order_id` INT NOT NULL,
  `assigned_mechanic` VARCHAR(120) NULL,
  `diagnosis` TEXT NULL,
  `observations` TEXT NULL,
  `failures` JSON NULL,
  `repairs` JSON NULL,
  `parts` JSON NULL,
  `labor_hours` DECIMAL(6,2) NOT NULL DEFAULT 0,
  `tests` JSON NULL,
  `cost` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `evidence` JSON NULL,
  PRIMARY KEY (`order_id`),
  CONSTRAINT `fk_mechanic_data_orders` FOREIGN KEY (`order_id`) REFERENCES `work_orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `work_orders`
  MODIFY COLUMN `status` ENUM('solicitada', 'recibido', 'diagnóstico', 'en_diagnostico', 'cotizacion_pendiente', 'cotizacion_aprobada', 'reparación', 'en_reparacion', 'esperando_aprobacion', 'trabajo_terminado', 'listo', 'listo_para_entrega', 'entregado', 'cerrado', 'cancelado') NOT NULL DEFAULT 'solicitada';

INSERT INTO `users` (`id`, `name`, `email`, `password`, `role`) VALUES
  (1, 'Administrador Nexus', 'admin@nexuscars.cl', 'admin123', 'admin'),
  (2, 'Camila Rojas', 'cliente@nexuscars.cl', 'cliente123', 'cliente'),
  (3, 'Recepcionista Nexus', 'recepcionista@nexuscars.cl', 'admin123', 'recepcionista'),
  (4, 'Carlos Silva', 'mecanico@nexuscars.cl', 'mecanico123', 'mecanico')
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `password` = VALUES(`password`),
  `role` = VALUES(`role`);

INSERT INTO `vehicles` (`id`, `owner_id`, `type`, `brand`, `model`, `plate`, `year`) VALUES
  (1, 2, 'Auto', 'Mazda', 'CX-5', 'KT-42-18', 2021),
  (2, 2, 'Moto', 'Yamaha', 'FZ 25', 'LM-08-77', 2022)
ON DUPLICATE KEY UPDATE
  `owner_id` = VALUES(`owner_id`),
  `type` = VALUES(`type`),
  `brand` = VALUES(`brand`),
  `model` = VALUES(`model`),
  `year` = VALUES(`year`);

INSERT INTO `work_orders` (`id`, `client_id`, `vehicle_id`, `description`, `status`, `created_at`, `next_maintenance`) VALUES
  (1001, 2, 1, 'Mantención de 40.000 km y revisión de frenos.', 'diagnóstico', '2024-08-28 09:00:00', '2025-02-28'),
  (1002, 2, 2, 'Revisión general para viaje.', 'listo', '2024-07-12 09:00:00', '2025-01-12')
ON DUPLICATE KEY UPDATE
  `client_id` = VALUES(`client_id`),
  `vehicle_id` = VALUES(`vehicle_id`),
  `description` = VALUES(`description`),
  `status` = VALUES(`status`),
  `next_maintenance` = VALUES(`next_maintenance`);

INSERT INTO `work_order_services` (`id`, `order_id`, `service_name`) VALUES
  (1, 1001, 'Cambio de aceite'),
  (2, 1001, 'Revisión de frenos'),
  (3, 1002, 'Mantención preventiva')
ON DUPLICATE KEY UPDATE
  `service_name` = VALUES(`service_name`);
