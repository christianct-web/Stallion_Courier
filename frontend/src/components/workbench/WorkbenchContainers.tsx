import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Types ────────────────────────────────────────────────────────────────
interface Container {
  id: string;
  containerNo: string;
  type: string;
  packageType: string;
  packages: number;
  goodsWeight: number;
}

interface WorkbenchContainersProps {
  containers: Container[];
  setContainers: React.Dispatch<React.SetStateAction<Container[]>>;
  packages: Array<{ code: string; label: string }>;
  sectionErrors: number;
  sectionWarnings: number;
}

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const CONTAINER_TYPES = [
  { code: "20GP", label: "20' General Purpose" },
  { code: "40GP", label: "40' General Purpose" },
  { code: "40HC", label: "40' High Cube" },
  { code: "20RF", label: "20' Reefer" },
  { code: "40RF", label: "40' Reefer" },
  { code: "20OT", label: "20' Open Top" },
  { code: "40OT", label: "40' Open Top" },
  { code: "LCL",  label: "LCL / Groupage" },
  { code: "AIR",  label: "Air Freight" },
];

function WbField({
  label, value, onChange, mono = false, placeholder, type = "text",
}: {
  label: string; value: string | number;
  onChange: (v: string) => void;
  mono?: boolean; placeholder?: string; type?: string;
}) {
  return (
    <div className="wb-field">
      <div className="wb-field-label">{label}</div>
      <input
        type={type}
        className={`wb-field-input${mono ? " mono" : ""}`}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function WbSelect({
  label, value, onValueChange, options, valueKey, labelKey,
}: {
  label: string; value: string; onValueChange: (v: string) => void;
  options: any[]; valueKey: string; labelKey: string;
}) {
  return (
    <div className="wb-field">
      <div className="wb-field-label">{label}</div>
      <div className="wb-select" style={{ display: "flex", alignItems: "center" }}>
        <Select value={value} onValueChange={onValueChange}>
          <SelectTrigger style={{ flex: 1 }}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {options.map(o => (
              <SelectItem key={o[valueKey]} value={o[valueKey]}>
                {o[labelKey]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ─── Single container row ──────────────────────────────────────────────────
function ContainerEditor({
  container, idx, total, onChange, onRemove, packages,
}: {
  container: Container; idx: number; total: number;
  onChange: (id: string, key: keyof Container, value: any) => void;
  onRemove: (id: string) => void;
  packages: Array<{ code: string; label: string }>;
}) {
  const S = (k: keyof Container) => (v: string) => onChange(container.id, k, v);
  const N = (k: keyof Container) => (v: string) => onChange(container.id, k, Number(v || 0));

  return (
    <div className="wb-item-card">
      <div className="wb-item-card-header">
        <span className="wb-item-card-title">
          CONTAINER {idx + 1} OF {total}
        </span>
        <button
          className="wb-btn wb-btn-danger"
          style={{ padding: "3px 10px", fontSize: 11 }}
          onClick={() => onRemove(container.id)}
        >
          Remove
        </button>
      </div>

      <WbField
        label="Container No."
        value={container.containerNo}
        onChange={S("containerNo")}
        mono placeholder="TCKU3897652"
      />
      <WbSelect
        label="Type"
        value={container.type}
        onValueChange={S("type")}
        options={CONTAINER_TYPES} valueKey="code" labelKey="label"
      />
      <WbSelect
        label="Package Type"
        value={container.packageType}
        onValueChange={S("packageType")}
        options={packages} valueKey="code" labelKey="label"
      />
      <WbField
        label="No. of Packages"
        value={container.packages}
        onChange={N("packages")}
        mono type="number" placeholder="0"
      />
      <WbField
        label="Goods Weight (kg)"
        value={container.goodsWeight}
        onChange={N("goodsWeight")}
        mono type="number" placeholder="0.00"
      />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────
export function WorkbenchContainers({
  containers, setContainers, packages, sectionErrors, sectionWarnings,
}: WorkbenchContainersProps) {

  const handleChange = (id: string, key: keyof Container, value: any) => {
    setContainers(cs => cs.map(c => c.id === id ? { ...c, [key]: value } : c));
  };

  const handleRemove = (id: string) => {
    setContainers(cs => cs.filter(c => c.id !== id));
  };

  const handleAdd = () => {
    setContainers(cs => [...cs, {
      id: uid(),
      containerNo: "", type: "", packageType: "", packages: 0, goodsWeight: 0,
    }]);
  };

  const hasIssue = sectionErrors > 0 || sectionWarnings > 0;
  const titleCls = sectionErrors > 0 ? "has-errors" : sectionWarnings > 0 ? "has-warnings" : "";

  return (
    <div className="wb-card" id="section-containers">
      <div className="wb-card-header">
        <span className={`wb-card-title ${titleCls}`}>
          Containers · {containers.length} {containers.length === 1 ? "Entry" : "Entries"}
          {hasIssue && (
            <span style={{ marginLeft: 8 }}>({sectionErrors}E / {sectionWarnings}W)</span>
          )}
        </span>
        <button className="wb-btn wb-btn-ghost" onClick={handleAdd}>
          + Add Container
        </button>
      </div>

      <div className="wb-card-body" style={{ paddingBottom: 4 }}>
        {containers.map((c, idx) => (
          <ContainerEditor
            key={c.id}
            container={c}
            idx={idx}
            total={containers.length}
            onChange={handleChange}
            onRemove={handleRemove}
            packages={packages}
          />
        ))}

        {containers.length === 0 && (
          <div style={{
            padding: "32px 16px", textAlign: "center",
            fontFamily: "var(--wb-font-serif)", fontStyle: "italic",
            color: "var(--wb-ink-light)", fontSize: 13,
          }}>
            No containers. Click "Add Container" or leave empty for LCL / airfreight.
          </div>
        )}
      </div>
    </div>
  );
}
