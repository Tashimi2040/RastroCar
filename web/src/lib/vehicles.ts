import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { useRealtime } from './realtime';
import type { Vehicle, VehicleState } from './types';

function computeState(v: Vehicle): VehicleState {
  if (!v.device_id) return 'no_device';
  if (!v.online) return 'offline';
  if ((v.speed ?? 0) >= 5) return 'moving';
  if (v.ignition) return 'idle';
  return 'stopped';
}

/** Lista de veículos com última posição, atualizada em tempo real. */
export function useLiveVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<Vehicle[]>('/api/positions/latest')
      .then((v) => {
        setVehicles(v);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  useRealtime((m) => {
    if (m.type === 'position') {
      const p = m.data;
      setVehicles((list) =>
        list.map((v) => {
          if (v.device_id !== p.device_id) return v;
          const next: Vehicle = {
            ...v,
            position_id: p.id,
            fix_time: p.fix_time,
            lat: p.valid ? p.lat : v.lat,
            lng: p.valid ? p.lng : v.lng,
            speed: p.speed,
            course: p.course ?? v.course,
            ignition: p.ignition == null ? v.ignition : p.ignition === 1,
            battery_level: p.battery_level ?? v.battery_level,
            power_voltage: p.power_voltage ?? v.power_voltage,
            gsm_signal: p.gsm_signal ?? v.gsm_signal,
            satellites: p.satellites ?? v.satellites,
            odometer_m: p.odometer_m ?? v.odometer_m,
            last_seen_at: p.server_time ?? Date.now(),
            online: true,
            blocked: p.blocked ?? v.blocked,
            trip_open: p.trip_open ?? v.trip_open,
          };
          next.state = computeState(next);
          return next;
        }),
      );
    } else if (m.type === 'device') {
      const d = m.data;
      setVehicles((list) =>
        list.map((v) => {
          if (v.device_id !== d.id) return v;
          const next: Vehicle = { ...v, online: d.online ?? v.online, last_seen_at: d.online ? Date.now() : v.last_seen_at };
          if (d.status) {
            if (d.status.ignition != null) next.ignition = d.status.ignition;
            if (d.status.batteryLevel != null) next.battery_level = d.status.batteryLevel;
            if (d.status.powerVoltage != null) next.power_voltage = d.status.powerVoltage;
            if (d.status.gsmSignal != null) next.gsm_signal = d.status.gsmSignal;
            if (d.status.blocked != null) next.blocked = d.status.blocked;
          }
          next.state = computeState(next);
          return next;
        }),
      );
      if (d.new) load();
    } else if (m.type === 'trip') {
      setVehicles((list) => list.map((v) => (v.device_id === m.data.deviceId ? { ...v, trip_open: m.data.status === 'open' } : v)));
    }
  });

  return { vehicles, loading, error, reload: load };
}
