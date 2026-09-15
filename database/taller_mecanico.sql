CREATE DATABASE IF NOT EXISTS `taller_mecanico` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `taller_mecanico`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'cliente') NOT NULL DEFAULT 'cliente',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `vehicles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `owner_id` INT NOT NULL,
  `type` ENUM('Auto', 'Moto') NOT NULL,
  `brand` VARCHAR(50) NOT NULL,
  `model` VARCHAR(80) NOT NULL,
  `plate` VARCHAR(20) NOT NULL,
  `year` SMALLINT NOT NULL,
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
  `status` ENUM('solicitada', 'recibido', 'diagnóstico', 'reparación', 'listo') NOT NULL DEFAULT 'solicitada',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `next_maintenance` VARCHAR(50) NOT NULL DEFAULT 'Por definir',
  `quote_status` ENUM('pendiente', 'aprobado', 'rechazado') NOT NULL DEFAULT 'pendiente',
  PRIMARY KEY (`id`),
  KEY `idx_work_orders_client_id` (`client_id`),
  KEY `idx_work_orders_vehicle_id` (`vehicle_id`),
  CONSTRAINT `fk_work_orders_users` FOREIGN KEY (`client_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_work_orders_vehicles` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE
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
  MODIFY COLUMN `status` ENUM('solicitada', 'recibido', 'diagnóstico', 'reparación', 'listo') NOT NULL DEFAULT 'solicitada';

INSERT INTO `users` (`id`, `name`, `email`, `password`, `role`) VALUES
  (1, 'Administrador Nexus', 'admin@nexuscars.cl', 'admin123', 'admin'),
  (2, 'Camila Rojas', 'cliente@nexuscars.cl', 'cliente123', 'cliente')
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
