/**
 * Migrações SQL versionadas. Nunca edite uma migração já aplicada:
 * adicione uma nova entrada ao final do array.
 */
export const migrations: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: 'schema_inicial',
    sql: `
      CREATE TABLE clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        document TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin','operator','client')),
        active INTEGER NOT NULL DEFAULT 1,
        last_login_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_users_client ON users(client_id);

      CREATE TABLE vehicles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        plate TEXT,
        brand TEXT,
        model TEXT,
        year INTEGER,
        color TEXT,
        type TEXT NOT NULL DEFAULT 'car',
        speed_limit INTEGER,
        odometer_offset_m INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_vehicles_client ON vehicles(client_id);

      CREATE TABLE devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        imei TEXT NOT NULL UNIQUE,
        name TEXT,
        protocol TEXT,
        model TEXT,
        sim_phone TEXT,
        sim_carrier TEXT,
        vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','disabled')),
        last_seen_at INTEGER,
        last_position_id INTEGER,
        last_ip TEXT,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_devices_vehicle ON devices(vehicle_id);

      CREATE TABLE positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        vehicle_id INTEGER,
        protocol TEXT,
        fix_time INTEGER NOT NULL,
        server_time INTEGER NOT NULL,
        valid INTEGER NOT NULL DEFAULT 1,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        altitude REAL,
        speed REAL NOT NULL DEFAULT 0,
        course REAL,
        satellites INTEGER,
        ignition INTEGER,
        battery_level INTEGER,
        power_voltage REAL,
        gsm_signal INTEGER,
        odometer_m INTEGER,
        alarm TEXT,
        attributes TEXT,
        raw TEXT
      );
      CREATE INDEX idx_positions_device_time ON positions(device_id, fix_time);
      CREATE INDEX idx_positions_vehicle_time ON positions(vehicle_id, fix_time);

      CREATE TABLE trips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        vehicle_id INTEGER,
        client_id INTEGER,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        start_position_id INTEGER,
        end_position_id INTEGER,
        start_lat REAL, start_lng REAL,
        end_lat REAL, end_lng REAL,
        start_address TEXT,
        end_address TEXT,
        distance_m REAL NOT NULL DEFAULT 0,
        duration_s INTEGER NOT NULL DEFAULT 0,
        max_speed REAL NOT NULL DEFAULT 0,
        avg_speed REAL NOT NULL DEFAULT 0,
        points INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_trips_device_time ON trips(device_id, start_time);
      CREATE INDEX idx_trips_vehicle_time ON trips(vehicle_id, start_time);
      CREATE INDEX idx_trips_client_time ON trips(client_id, start_time);

      CREATE TABLE stops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        vehicle_id INTEGER,
        client_id INTEGER,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        address TEXT,
        duration_s INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX idx_stops_device_time ON stops(device_id, start_time);

      CREATE TABLE geofences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('circle','polygon')),
        geometry TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#2563eb',
        alert_on_enter INTEGER NOT NULL DEFAULT 1,
        alert_on_exit INTEGER NOT NULL DEFAULT 1,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX idx_geofences_client ON geofences(client_id);

      CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        vehicle_id INTEGER,
        client_id INTEGER,
        type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
        title TEXT NOT NULL,
        message TEXT,
        position_id INTEGER,
        lat REAL, lng REAL,
        geofence_id INTEGER,
        data TEXT,
        acknowledged INTEGER NOT NULL DEFAULT 0,
        acknowledged_by INTEGER,
        acknowledged_at INTEGER,
        event_time INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_events_client_time ON events(client_id, event_time);
      CREATE INDEX idx_events_device_time ON events(device_id, event_time);
      CREATE INDEX idx_events_ack ON events(acknowledged);

      CREATE TABLE commands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        payload TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','confirmed','failed','cancelled')),
        response TEXT,
        created_by INTEGER,
        created_at INTEGER NOT NULL,
        sent_at INTEGER,
        confirmed_at INTEGER,
        error TEXT
      );
      CREATE INDEX idx_commands_device_status ON commands(device_id, status);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE geocode_cache (
        key TEXT PRIMARY KEY,
        address TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        entity TEXT,
        entity_id INTEGER,
        details TEXT,
        ip TEXT,
        created_at INTEGER NOT NULL
      );
    `,
  },
];
