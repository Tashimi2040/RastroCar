import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '../lib/api';
import type { Vehicle } from '../lib/types';
import { Loading, Empty, Stat, useToast } from '../components/ui';
import { dayjs, fmtDistance, fmtDuration, fmtSpeed, fmtTime, toInputDateTime } from '../lib/format';
import { Route, MapPin, Clock, Gauge } from 'lucide-react';

interface DayRow {
  day: string;
  vehicle_id: number;
  vehicle_name: string;
  vehicle_plate: string | null;
  trips: number;
  distance_m: number;
  duration_s: number;
  max_speed: number;
  first_start: number;
  last_end: number;
}

export function Reports() {
  const toast = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<number>(0);
  const [from, setFrom] = useState(toInputDateTime(dayjs().subtract(29, 'day').startOf('day').valueOf()));
  const [to, setTo] = useState(toInputDateTime(dayjs().endOf('day').valueOf()));
  const [data, setData] = useState<{ days: DayRow[]; totals: { trips: number; distance_m: number; duration_s: number; max_speed: number } } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<Vehicle[]>('/api/vehicles').then(setVehicles);
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      setData(await api.get('/api/trips/summary', { vehicleId: vehicleId || undefined, from: dayjs(from).toISOString(), to: dayjs(to).toISOString() }));
    } catch (e: any) {
      toast('error', e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = () => {
    if (!data) return;
    const rows = [['dia', 'veiculo', 'placa', 'viagens', 'distancia_km', 'tempo_movimento', 'vel_maxima', 'primeira_saida', 'ultima_chegada'], ...data.days.map((d) => [d.day, d.vehicle_name, d.vehicle_plate ?? '', d.trips, (d.distance_m / 1000).toFixed(2), fmtDuration(d.duration_s), Math.round(d.max_speed), fmtTime(d.first_start), fmtTime(d.last_end)])];
    const blob = new Blob(['﻿' + rows.map((r) => r.join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `relatorio-${dayjs(from).format('YYYYMMDD')}-${dayjs(to).format('YYYYMMDD')}.csv`;
    a.click();
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="card-body row" style={{ gap: 10 }}>
          <select className="select" style={{ width: 260 }} value={vehicleId} onChange={(e) => setVehicleId(Number(e.target.value))}>
            <option value={0}>Todos os veículos</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.name} {v.plate ? `· ${v.plate}` : ''}</option>
            ))}
          </select>
          <input className="input" style={{ width: 200 }} type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input className="input" style={{ width: 200 }} type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          <button className="btn primary" onClick={load} disabled={loading}>Gerar</button>
          <button className="btn" onClick={exportCsv} disabled={!data?.days.length}>
            <Download size={15} /> CSV
          </button>
        </div>
      </div>
      {loading || !data ? (
        <Loading />
      ) : (
        <>
          <div className="grid cols-4">
            <Stat label="Viagens" value={data.totals.trips} icon={<Route size={20} />} color="#2563eb" />
            <Stat label="Distância total" value={fmtDistance(data.totals.distance_m)} icon={<MapPin size={20} />} color="#16a34a" />
            <Stat label="Tempo em movimento" value={fmtDuration(data.totals.duration_s)} icon={<Clock size={20} />} color="#7c3aed" />
            <Stat label="Velocidade máxima" value={fmtSpeed(data.totals.max_speed)} icon={<Gauge size={20} />} color="#dc2626" />
          </div>
          <div className="card">
            <div className="card-header"><h2>Resumo diário</h2></div>
            <div className="card-body tight">
              {!data.days.length ? (
                <Empty text="Nenhuma viagem concluída no período" />
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Dia</th>
                        <th>Veículo</th>
                        <th>Viagens</th>
                        <th>Distância</th>
                        <th>Tempo em movimento</th>
                        <th>Vel. máxima</th>
                        <th>Primeira saída</th>
                        <th>Última chegada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.days.map((d) => (
                        <tr key={`${d.day}-${d.vehicle_id}`}>
                          <td>{dayjs(d.day).format('DD/MM/YYYY (ddd)')}</td>
                          <td>
                            <div className="strong">{d.vehicle_name}</div>
                            <div className="tiny muted">{d.vehicle_plate}</div>
                          </td>
                          <td>{d.trips}</td>
                          <td>{fmtDistance(d.distance_m)}</td>
                          <td>{fmtDuration(d.duration_s)}</td>
                          <td>{fmtSpeed(d.max_speed)}</td>
                          <td>{fmtTime(d.first_start)}</td>
                          <td>{fmtTime(d.last_end)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
