import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { CountryCodeSelect } from "./CountryCodeSelect";
import { PinInput } from "./PinInput";
import { ROLE_LABELS, ROLE_COLORS, type StaffRole } from "../lib/staff-auth";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { APP_CONFIG, BRAND_COLOR } from "../lib/config";
import { UserPlus, Users, Shield, ShieldOff, Trash2, Phone, User, RefreshCw, ShieldCheck, ShieldAlert, Ban, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface StaffMember {
  id: string;
  phone: string;
  name: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  deactivatedAt?: string;
}

interface StaffManagementProps {
  accessToken: string;
}

export function StaffManagement({ accessToken }: StaffManagementProps) {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newCountryCode, setNewCountryCode] = useState(APP_CONFIG.phone.defaultCountryCode);
  const [newPin, setNewPin] = useState("");
  const [newRole, setNewRole] = useState<StaffRole>("cashier");
  const [creating, setCreating] = useState(false);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StaffMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${publicAnonKey}`,
    "X-Custom-Auth": accessToken,
  };

  const fetchStaff = async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      const res = await fetch(`${API_BASE}/admin/staff`, { headers });
      if (res.ok) {
        const data = await res.json();
        setStaffList(data.staff || []);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to load staff");
      }
    } catch (error: any) {
      toast.error(`Failed to load staff: ${error.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim() || !newPhone.trim() || newPin.length < 6) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      setCreating(true);
      const fullPhone = `${newCountryCode}${newPhone.replace(/^0+/, '')}`;
      const res = await fetch(`${API_BASE}/admin/staff`, {
        method: "POST",
        headers,
        body: JSON.stringify({ phone: fullPhone, pin: newPin, name: newName.trim(), role: newRole }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create staff");

      toast.success(`${newName} added as ${ROLE_LABELS[newRole]}`);
      setCreateOpen(false);
      resetCreateForm();
      fetchStaff();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (staff: StaffMember) => {
    try {
      const action = staff.active ? 'deactivate' : 'activate';
      const res = await fetch(`${API_BASE}/admin/staff/${staff.id}/${action}`, {
        method: "PUT",
        headers,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${action} staff`);
      }

      toast.success(`${staff.name} ${action}d successfully`);
      fetchStaff();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const res = await fetch(`${API_BASE}/admin/staff/${deleteTarget.id}`, {
        method: "DELETE",
        headers,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete staff");
      }

      toast.success(`${deleteTarget.name} removed from staff`);
      setDeleteOpen(false);
      setDeleteTarget(null);
      fetchStaff();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setDeleting(false);
    }
  };

  const resetCreateForm = () => {
    setNewName("");
    setNewPhone("");
    setNewPin("");
    setNewRole("cashier");
    setNewCountryCode(APP_CONFIG.phone.defaultCountryCode);
  };

  const getRoleIcon = (role: StaffRole) => {
    switch (role) {
      case 'superuser': return <ShieldCheck className="w-4 h-4" />;
      case 'manager': return <ShieldAlert className="w-4 h-4" />;
      default: return <User className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND_COLOR, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5" style={{ color: BRAND_COLOR }} />
          <h3 className="text-lg font-semibold">Staff Management</h3>
          <Badge variant="secondary" className="ml-1">{staffList.length}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchStaff(true)} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} style={{ backgroundColor: BRAND_COLOR }} className="text-white">
            <UserPlus className="w-4 h-4 mr-1" />
            Add Staff
          </Button>
        </div>
      </div>

      {/* Staff Role Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {(['superuser', 'manager', 'cashier', 'kitchen', 'delivery'] as StaffRole[]).map(role => {
          const count = staffList.filter(s => s.role === role && s.active).length;
          return (
            <div key={role} className={`rounded-lg px-3 py-2 text-center ${ROLE_COLORS[role]}`}>
              <p className="text-xs font-medium">{ROLE_LABELS[role]}</p>
              <p className="text-lg font-bold">{count}</p>
            </div>
          );
        })}
      </div>

      {/* Staff List */}
      <div className="space-y-2">
        {staffList.map((member) => (
          <Card key={member.id} className={`p-4 ${!member.active ? 'opacity-60 bg-gray-50' : ''}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${ROLE_COLORS[member.role]}`}>
                  {getRoleIcon(member.role)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm truncate">{member.name}</p>
                    <Badge variant="outline" className={`text-[10px] ${ROLE_COLORS[member.role]}`}>
                      {ROLE_LABELS[member.role]}
                    </Badge>
                    {!member.active && (
                      <Badge variant="destructive" className="text-[10px]">Inactive</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Phone className="w-3 h-3" />
                    {member.phone}
                  </div>
                  <p className="text-[10px] text-gray-400">
                    Added {new Date(member.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {member.role !== 'superuser' && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleActive(member)}
                    className={member.active ? "text-orange-600 hover:text-orange-700" : "text-green-600 hover:text-green-700"}
                  >
                    {member.active ? (
                      <><Ban className="w-3.5 h-3.5 mr-1" /> Deactivate</>
                    ) : (
                      <><CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Activate</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setDeleteTarget(member); setDeleteOpen(true); }}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}

        {staffList.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No staff members yet</p>
            <p className="text-sm">Add your first staff member to get started.</p>
          </div>
        )}
      </div>

      {/* Create Staff Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" style={{ color: BRAND_COLOR }} />
              Add Staff Member
            </DialogTitle>
            <DialogDescription>
              Create a new staff account with a specific role.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="Staff member name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Phone Number</Label>
              <div className="flex gap-2">
                <CountryCodeSelect value={newCountryCode} onChange={setNewCountryCode} />
                <Input
                  type="tel"
                  placeholder="8123456789"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ''))}
                  className="flex-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>6-Digit PIN</Label>
              <PinInput value={newPin} onChange={setNewPin} />
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as StaffRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                  <SelectItem value="kitchen">Kitchen Staff</SelectItem>
                  <SelectItem value="delivery">Delivery</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                {newRole === 'manager' && "Full access except staff management & branding"}
                {newRole === 'cashier' && "Orders and payments only"}
                {newRole === 'kitchen' && "Kitchen ticket board — view and update cooking orders"}
                {newRole === 'delivery' && "Delivery queue — view ready orders and mark delivered"}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetCreateForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newName.trim() || !newPhone.trim() || newPin.length < 6}
              className="text-white"
              style={{ backgroundColor: BRAND_COLOR }}
            >
              {creating ? "Creating..." : "Create Staff"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Delete Staff Member
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently remove <strong>{deleteTarget?.name}</strong> ({deleteTarget?.role ? ROLE_LABELS[deleteTarget.role] : ''})? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
