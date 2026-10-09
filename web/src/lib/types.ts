export type Role = 'admin' | 'operator' | 'client';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  clientId: number | null;
  client?: { id: number; name: string } | null;
}

export type VehicleState = 'offline' | 'moving' | 'stopped' | 'idle' | 'no_device';

export interface Vehicle {
  id: number;
  client_id: number;
  client_name?: string;
  name: string;
  plate: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  type: string;
  speed_limit: number | null;
  notes: string | null;
  active: number;
  device_id: number | null;
  imei: string | null;
  protocol: string | null;
  device_status: string | null;
  last_seen_at: number | null;
  sim_phone: string | null;
  position_id: number | null;
  fix_time: number | null;
  lat: number | null;
  lng: number | null;
  speed: number | null;
  course: number | null;
  ignition: boolean | null;
  battery_level: number | null;
  power_voltage: number | null;
  gsm_signal: number | null;
  satellites: number | null;
  odometer_m: number | null;
  total_distance_m: number;
  online: boolean;
  connected: boolean;
  blocked: boolean | null;
  trip_open: boolean;
  state: VehicleState;
}

export interface Device {
  id: number;
  imei: string;
  name: string | null;
  protocol: string | null;
  model: string | null;
  sim_phone: string | null;
  sim_carrier: string | null;
  vehicle_id: number | null;
  vehicle_name: string | null;
  vehicle_plate: string | null;
  client_id: number | null;
  client_name: string | null;
  status: 'pending' | 'active' | 'disabled';
  last_seen_at: number | null;
  last_ip: string | null;
  notes: string | null;
  fix_time: number | null;
  lat: number | null;
  lng: number | null;
  speed: number | null;
  ignition: boolean | null;
  battery_level: number | null;
  power_voltage: number | null;
  gsm_signal: number | null;
  positions_count: number;
  online: boolean;
  connected: boolean;
  blocked: boolean | null;
  created_at: number;
}

export interface Client {
  id: number;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  active: number;
  vehicles_count?: number;
  users_count?: number;
  devices_count?: number;
  created_at: number;
}

export interface Position {
  id: number;
  fix_time: number;
  lat: number;
  lng: number;
  speed: number;
  course: number | null;
  ignition: number | null;
  satellites?: number | null;
  alarm?: string | null;
  battery_level?: number | null;
  power_voltage?: number | null;
  gsm_signal?: number | null;
  odometer_m?: number | null;
}

export interface Trip {
  id: number;
  device_id: number;
  vehicle_id: number | null;
  vehicle_name?: string;
  vehicle_plate?: string | null;
  status: 'open' | 'closed';
  start_time: number;
  end_time: number | null;
  start_lat: number;
  start_lng: number;
  end_lat: number | null;
  end_lng: number | null;
  start_address: string | null;
  end_address: string | null;
  distance_m: number;
  duration_s: number;
  max_speed: number;
  avg_speed: number;
  points: number;
}

export interface Stop {
  id: number;
  vehicle_id: number | null;
  vehicle_name?: string;
  start_time: number;
  end_time: number | null;
  lat: number;
  lng: number;
  address: string | null;
  duration_s: number;
}

export interface EventRow {
  id: number;
  device_id: number;
  vehicle_id: number | null;
  vehicle_name?: string | null;
  vehicle_plate?: string | null;
  client_name?: string | null;
  imei?: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string | null;
  lat: number | null;
  lng: number | null;
  acknowledged: number;
  event_time: number;
}

export interface Geofence {
  id: number;
  client_id: number;
  client_name?: string;
  vehicle_id: number | null;
  vehicle_name?: string | null;
  name: string;
  type: 'circle' | 'polygon';
  geometry: { type: 'circle'; center: { lat: number; lng: number }; radius: number } | { type: 'polygon'; points: { lat: number; lng: number }[] };
  color: string;
  alert_on_enter: number;
  alert_on_exit: number;
  active: number;
}

export interface Command {
  id: number;
  device_id: number;
  imei: string;
  vehicle_name: string | null;
  type: string;
  payload: string | null;
  status: 'pending' | 'sent' | 'confirmed' | 'failed' | 'cancelled';
  response: string | null;
  error: string | null;
  user_name: string | null;
  created_at: number;
  sent_at: number | null;
  confirmed_at: number | null;
}

export interface Settings {
  company_name: string;
  public_host: string;
  tcp_port: number;
  map_tile_url: string;
  map_attribution: string;
  map_center_lat: number;
  map_center_lng: number;
  map_zoom: number;
  default_speed_limit: number;
  trip_idle_timeout_min: number;
  trip_min_distance_m: number;
  offline_timeout_min: number;
  reverse_geocode: boolean;
  positions_retention_days: number;
  timezone: string;
  device_default_password: string;
  env?: { tcpPort: number; httpPort: number; autoRegisterDevices: boolean; dbPath: string };
}

export interface Dashboard {
  vehicles: number;
  devices: number;
  devicesPending: number;
  online: number;
  offline: number;
  moving: number;
  clients: number | null;
  today: { trips: number; distanceM: number; durationS: number; positions: number };
  alerts: { total: number; critical: number };
  gateway?: { connections: number; identified: number; wsClients: number; sessions: { id: number; imei: string | null; protocol: string | null; ip: string; connectedAt: number; lastActivity: number }[] };
}

export interface SetupInstructions {
  model: { id: string; name: string; protocol: string; description: string };
  carrier: { name: string; apn: string };
  host: string;
  port: number;
  password: string;
  steps: { title: string; sms: string; note?: string }[];
  tips: string[];
}
