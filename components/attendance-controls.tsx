"use client";

import { useActionState, useRef, useState } from "react";
import { recordAttendanceEvent } from "@/app/actions/attendance";
import type { AttendanceType } from "@/lib/attendance-rules";

type LocationOption = { id: string; name: string };

const labels: Record<AttendanceType, string> = {
  ClockIn: "Clock in",
  LunchStart: "Start lunch",
  LunchEnd: "End lunch",
  ClockOut: "Clock out",
  DutyCheckIn: "Check in to duty",
  DutyCheckOut: "Check out of duty",
};

export function AttendanceEventControl({
  type,
  locations,
  dutyId,
  dutyTitle,
}: {
  type: AttendanceType;
  locations: LocationOption[];
  dutyId?: string;
  dutyTitle?: string;
}) {
  const [message, action, pending] = useActionState(recordAttendanceEvent, null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const bypassNextSubmit = useRef(false);
  const label = labels[type];

  function acquireLocation(event: React.FormEvent<HTMLFormElement>) {
    if (bypassNextSubmit.current) {
      bypassNextSubmit.current = false;
      return;
    }
    event.preventDefault();
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("This browser does not provide GPS location access.");
      return;
    }
    const form = event.currentTarget;
    setLocating(true);
    navigator.geolocation.getCurrentPosition((position) => {
      for (const [name, value] of Object.entries({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        measuredAt: position.timestamp,
      })) {
        const input = form.elements.namedItem(name);
        if (input instanceof HTMLInputElement) input.value = String(value);
      }
      bypassNextSubmit.current = true;
      setLocating(false);
      form.requestSubmit();
    }, (error) => {
      setLocating(false);
      setLocationError(error.code === error.PERMISSION_DENIED
        ? "Location permission was denied. Allow browser location access to record attendance."
        : error.code === error.TIMEOUT
          ? "The GPS request timed out. Move to an area with a clearer signal and retry."
          : "Your browser could not get a location. Enable device location and retry.");
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 });
  }

  return (
    <form action={action} className="attendance-control" onSubmit={acquireLocation}>
      <input name="type" type="hidden" value={type} />
      {dutyId ? <input name="dutyId" type="hidden" value={dutyId} /> : null}
      <input name="latitude" type="hidden" />
      <input name="longitude" type="hidden" />
      <input name="accuracyMeters" type="hidden" />
      <input name="measuredAt" type="hidden" />
      <label className="foundation-field">
        <span>Approved location</span>
        <select name="locationId" required defaultValue="" disabled={!locations.length || pending || locating}>
          <option value="" disabled>Select an owner-approved location</option>
          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
        </select>
      </label>
      {dutyTitle ? <p className="foundation-muted">Duty: {dutyTitle}</p> : null}
      <button className="button-primary" type="submit" disabled={!locations.length || pending || locating}>
        {locating ? "Getting GPS…" : pending ? "Saving…" : label}
      </button>
      {locationError ? <p className="foundation-error" role="alert">{locationError}</p> : null}
      {message ? <p className={message.startsWith("success:") ? "foundation-notice" : "foundation-error"} role={message.startsWith("success:") ? "status" : "alert"}>
        {message.startsWith("success:") ? message.slice(8) : message}
      </p> : null}
    </form>
  );
}
