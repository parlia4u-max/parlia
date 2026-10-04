import { saveAttendanceLocation } from "@/app/actions/attendance";
import { ActionForm, SubmitButton } from "@/components/action-form";

export type EditableAttendanceLocation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  active: boolean;
};

export function AttendanceLocationForm({ location }: { location?: EditableAttendanceLocation }) {
  return (
    <ActionForm action={saveAttendanceLocation} className="foundation-form">
      {location ? <input name="locationId" type="hidden" value={location.id} /> : null}
      <div className="setup-field-grid">
        <label className="foundation-field"><span>Location name</span><input name="name" maxLength={120} required defaultValue={location?.name ?? ""} /></label>
        <label className="foundation-field"><span>Latitude</span><input name="latitude" type="number" min="-90" max="90" step="any" required defaultValue={location?.latitude ?? ""} /></label>
        <label className="foundation-field"><span>Longitude</span><input name="longitude" type="number" min="-180" max="180" step="any" required defaultValue={location?.longitude ?? ""} /></label>
        <label className="foundation-field"><span>Radius (metres)</span><input name="radiusMeters" type="number" min="25" max="2000" step="1" required defaultValue={location?.radiusMeters ?? 100} /></label>
      </div>
      {location ? <label className="foundation-field">
        <span>Location status</span>
        <select name="active" defaultValue={String(location.active)}>
          <option value="true">Approved and active</option>
          <option value="false">Deactivate (keep historical records)</option>
        </select>
      </label> : null}
      <SubmitButton>{location ? "Save location" : "Approve location"}</SubmitButton>
    </ActionForm>
  );
}
