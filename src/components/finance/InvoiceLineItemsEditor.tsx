import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  fee_package_id?: string;
}

export interface FeePackageOption {
  id: string;
  name: string;
  amount: number;
}

interface Props {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  readOnly?: boolean;
  availableFeePackages?: FeePackageOption[];
}

export function InvoiceLineItemsEditor({ items, onChange, readOnly, availableFeePackages }: Props) {
  const addItem = () => {
    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        description: "",
        quantity: 1,
        unit_price: 0,
        total: 0,
      },
    ]);
  };

  const addFromPackage = (packageId: string) => {
    const pkg = availableFeePackages?.find((p) => p.id === packageId);
    if (!pkg) return;
    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        description: pkg.name,
        quantity: 1,
        unit_price: pkg.amount,
        total: pkg.amount,
        fee_package_id: pkg.id,
      },
    ]);
  };

  const updateItem = (idx: number, field: keyof LineItem, value: string | number) => {
    const updated = [...items];
    const item = { ...updated[idx], [field]: value };
    if (field === "quantity" || field === "unit_price") {
      item.total = Number(item.quantity) * Number(item.unit_price);
    }
    updated[idx] = item;
    onChange(updated);
  };

  const removeItem = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const subtotal = items.reduce((sum, item) => sum + (item.total || 0), 0);

  // Fee packages not yet added
  const unusedPackages = availableFeePackages?.filter(
    (pkg) => !items.some((item) => item.fee_package_id === pkg.id)
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_80px_100px_100px_36px] gap-2 text-xs font-medium text-muted-foreground px-1">
        <span>Description</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Unit Price</span>
        <span className="text-right">Total</span>
        <span />
      </div>

      {items.map((item, idx) => (
        <div key={item.id} className="grid grid-cols-[1fr_80px_100px_100px_36px] gap-2 items-center">
          <Input
            value={item.description}
            onChange={(e) => updateItem(idx, "description", e.target.value)}
            placeholder="Fee description"
            disabled={readOnly}
            className="text-sm"
          />
          <Input
            type="number"
            min="1"
            value={item.quantity}
            onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)}
            disabled={readOnly}
            className="text-sm text-right"
          />
          <Input
            type="number"
            step="0.01"
            min="0"
            value={item.unit_price}
            onChange={(e) => updateItem(idx, "unit_price", parseFloat(e.target.value) || 0)}
            disabled={readOnly}
            className="text-sm text-right"
          />
          <div className="text-sm font-medium text-right pr-1">
            {item.total.toFixed(2)}
          </div>
          {!readOnly && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeItem(idx)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}

      {!readOnly && (
        <div className="flex items-center gap-2 mt-2">
          {unusedPackages && unusedPackages.length > 0 && (
            <Select onValueChange={addFromPackage}>
              <SelectTrigger className="w-[220px] text-sm">
                <SelectValue placeholder="Add from Fee Package..." />
              </SelectTrigger>
              <SelectContent>
                {unusedPackages.map((pkg) => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {pkg.name} — RM {pkg.amount.toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Custom Item
          </Button>
        </div>
      )}

      <div className="flex justify-end pt-2 border-t">
        <div className="text-sm">
          <span className="text-muted-foreground mr-3">Subtotal</span>
          <span className="font-semibold">RM {subtotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
