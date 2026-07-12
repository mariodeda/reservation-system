"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { adminJson } from "@/components/admin/api";
import { type AdminReservation, formatDateLong, STATUS_META, todayInTz } from "@/components/admin/shared";
import { am } from "@/i18n";
import { offeringServiceMap, offeringSummaries, type OfferingServices } from "@/lib/reservations/offerings";
import type { AvailabilityConfig, ReservationOrigin } from "@/lib/reservations/types";
import { serviceLabelFromOfferings } from "@/components/admin/service-labels";

function Sheet({ restaurantName }: { restaurantName: string }) {
  const params = useSearchParams();
  const date = params.get("date") || todayInTz();
  const autoPrint = params.get("print") !== "0";
  const [rows, setRows] = useState<AdminReservation[] | null>(null);
  const [offeringLabels, setOfferingLabels] = useState<Record<string, string>>({});
  const [offerings, setOfferings] = useState<OfferingServices[]>([]);

  useEffect(() => {
    adminJson<{ reservations: AdminReservation[] }>(`/api/admin/reservations?date=${date}`)
      .then((d) =>
        setRows(
          (d.reservations ?? []).filter((r) => r.status !== "cancelled" && r.status !== "no_show"),
        ),
      )
      .catch(() => setRows([]));
  }, [date]);

  useEffect(() => {
    adminJson<{ config: AvailabilityConfig }>("/api/admin/config")
      .then((d) => {
        setOfferingLabels(
          Object.fromEntries(offeringSummaries(d.config, restaurantName).map((o) => [o.id, o.label])),
        );
        setOfferings(offeringServiceMap(d.config, restaurantName));
      })
      .catch(() => {});
  }, [restaurantName]);

  useEffect(() => {
    if (autoPrint && rows && rows.length >= 0) {
      const id = setTimeout(() => window.print(), 400);
      return () => clearTimeout(id);
    }
  }, [rows, autoPrint]);

  const covers = (rows ?? []).reduce((s, r) => s + r.partySize, 0);

  // Group by (offering, service) — service ids are only unique within an
  // offering, so grouping by service alone would merge e.g. a Restaurant
  // "dinner" with an Events "dinner" on the same sheet. Sort by time within.
  const SEP = "\\u0000";
  const grouped: Map<string, AdminReservation[]> = new Map();
  for (const r of rows ?? []) {
    const key = `${r.offering || "main"}${SEP}${r.service}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }
  for (const [, group] of grouped) {
    group.sort((a, b) => a.time.localeCompare(b.time));
  }
  // Only label the offering when the day actually spans more than one.
  const distinctOfferings = new Set((rows ?? []).map((r) => r.offering || "main"));
  const showOffering = distinctOfferings.size > 1;
  const offeringLabel = (id: string) => offeringLabels[id] ?? id;
  const originLabel = (origin?: ReservationOrigin) => origin ? am.reservationOrigin[origin] : "";

  const dietary = (rows ?? []).filter((r) => r.dietaryNotes);
  const vips = (rows ?? []).filter((r) => r.customerVip);

  return (
    <div className="min-h-screen bg-white text-black p-8" style={{ fontFamily: "var(--font-montserrat), system-ui, sans-serif" }}>
      <style>{`
        @media print { .no-print { display:none !important } @page { margin: 14mm } }
        tr.dietary-row td { background: #fffbeb; }
        td { word-break: break-word; }
      `}</style>

      {/* Header */}
      <div className="flex items-start justify-between border-b-2 border-black pb-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-playfair), serif" }}>
            {restaurantName}
          </h1>
          <p className="text-sm text-neutral-600">{am.print.subtitle}</p>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">{formatDateLong(date)}</div>
          <div className="text-sm text-neutral-600">
            {am.print.headerStats(rows?.length ?? 0, covers)}
          </div>
        </div>
      </div>

      {/* Alerts bar */}
      {(dietary.length > 0 || vips.length > 0) && (
        <div className="flex flex-wrap gap-4 mb-4 text-sm">
          {vips.length > 0 && (
            <div className="border border-amber-400 rounded px-3 py-1.5 bg-amber-50">
              <span className="font-bold">{am.print.vips}</span>{" "}
              {vips.map((r) => r.name).join(", ")}
            </div>
          )}
          {dietary.length > 0 && (
            <div className="border border-orange-400 rounded px-3 py-1.5 bg-orange-50">
              <span className="font-bold">{am.print.dietary}</span>{" "}
              {dietary.map((r) => `${r.name} (${r.dietaryNotes})`).join(" · ")}
            </div>
          )}
        </div>
      )}

      <div className="no-print mb-4 flex gap-2">
        <button onClick={() => window.print()} className="border border-black rounded px-3 py-1 text-sm">
          {am.print.print}
        </button>
        <button onClick={() => window.close()} className="border border-neutral-400 text-neutral-600 rounded px-3 py-1 text-sm">
          {am.print.close}
        </button>
      </div>

      {rows === null ? (
        <p className="text-neutral-500">{am.print.loading}</p>
      ) : rows.length === 0 ? (
        <p className="text-neutral-500">{am.print.noReservations}</p>
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([key, group]) => {
            const sCovers = group.reduce((s, r) => s + r.partySize, 0);
            const sepIdx = key.indexOf(SEP);
            const offId = key.slice(0, sepIdx);
            const service = key.slice(sepIdx + SEP.length);
            const serviceLabel = serviceLabelFromOfferings(offerings, offId, service);
            const heading = showOffering ? `${offeringLabel(offId)} · ${serviceLabel}` : serviceLabel;
            return (
              <div key={key}>
                <div className="flex items-baseline justify-between border-b border-neutral-400 mb-1 pb-0.5">
                  <h2 className="text-base font-bold capitalize">{heading}</h2>
                  <span className="text-xs text-neutral-500">{am.print.serviceStats(group.length, sCovers)}</span>
                </div>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left border-b border-neutral-300 text-xs text-neutral-500 uppercase tracking-wide">
                      <th className="py-1.5 pr-3 font-medium">{am.print.colTime}</th>
                      <th className="py-1.5 pr-3 font-medium">{am.print.colGuests}</th>
                      <th className="py-1.5 pr-3 font-medium">{am.print.colName}</th>
                      <th className="py-1.5 pr-3 font-medium">{am.print.colTable}</th>
                      <th className="py-1.5 pr-3 font-medium">{am.print.colPhone}</th>
                      <th className="py-1.5 pr-3 font-medium">{am.print.colStatus}</th>
                      <th className="py-1.5 font-medium">{am.print.colNotes}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((r) => (
                      <tr
                        key={r.id}
                        className={`border-b border-neutral-200 align-top ${r.dietaryNotes ? "dietary-row" : ""}`}
                      >
                        <td className="py-2 pr-3 font-semibold tabular-nums whitespace-nowrap">{r.time}</td>
                        <td className="py-2 pr-3 tabular-nums font-medium">{r.partySize}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {r.customerVip && <span className="text-amber-600 font-bold mr-1">★</span>}
                          {r.name}
                          {r.occasion ? <span className="text-neutral-500 text-xs ml-1">· {r.occasion}</span> : null}
                          {r.source === "web" && r.reservationOrigin ? (
                            <div className="text-[10px] uppercase tracking-wide text-neutral-500">
                              {am.reservationOrigin.bookingOrigin}: {originLabel(r.reservationOrigin)}
                            </div>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 text-neutral-700">{r.tableLabel ?? <span className="text-neutral-300">—</span>}</td>
                        <td className="py-2 pr-3 whitespace-nowrap text-neutral-700">{r.phone}</td>
                        <td className="py-2 pr-3">
                          <span className="text-xs font-medium">{STATUS_META[r.status].label}</span>
                        </td>
                        <td className="py-2">
                          {r.dietaryNotes && (
                            <span className="text-orange-700 font-semibold text-xs">⚠ {r.dietaryNotes}</span>
                          )}
                          {r.notes && (
                            <span className={`text-neutral-600 text-xs ${r.dietaryNotes ? " · " : ""}${r.dietaryNotes ? "ml-1" : ""}`}>
                              {r.dietaryNotes ? "· " : ""}{r.notes}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {/* Signature line */}
      <div className="mt-8 pt-4 border-t border-neutral-300 flex gap-16 text-xs text-neutral-400 no-print">
        <span>{am.print.printed} {new Date().toLocaleString()}</span>
      </div>
    </div>
  );
}

export default function PrintSheet({ restaurantName }: { restaurantName: string }) {
  return (
    <Suspense>
      <Sheet restaurantName={restaurantName} />
    </Suspense>
  );
}
