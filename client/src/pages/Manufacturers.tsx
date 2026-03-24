import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Manufacturer {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
}

export default function Manufacturers() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingManufacturer, setEditingManufacturer] = useState<Manufacturer | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
  });

  const { data: manufacturers = [], isLoading } = useQuery<Manufacturer[]>({
    queryKey: ["/api/manufacturers"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/manufacturers", data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Manufacturer created" });
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers"] });
      setShowCreateDialog(false);
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create manufacturer", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const response = await apiRequest("PUT", `/api/manufacturers/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Manufacturer updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers"] });
      setEditingManufacturer(null);
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update manufacturer", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/manufacturers/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Manufacturer deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete manufacturer. It may have products assigned.", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ name: "", contactPerson: "", email: "", phone: "", address: "" });
  };

  const openEdit = (m: Manufacturer) => {
    setEditingManufacturer(m);
    setFormData({
      name: m.name,
      contactPerson: m.contactPerson || "",
      email: m.email || "",
      phone: m.phone || "",
      address: m.address || "",
    });
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" });
      return;
    }
    if (editingManufacturer) {
      updateMutation.mutate({ id: editingManufacturer.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const ManufacturerForm = () => (
    <div className="space-y-4">
      <div>
        <Label>Name *</Label>
        <Input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Manufacturer name"
        />
      </div>
      <div>
        <Label>Contact Person</Label>
        <Input
          value={formData.contactPerson}
          onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
          placeholder="Contact person name"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Email</Label>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="email@example.com"
          />
        </div>
        <div>
          <Label>Phone</Label>
          <Input
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="+1234567890"
          />
        </div>
      </div>
      <div>
        <Label>Address</Label>
        <Input
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          placeholder="Full address"
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="outline"
          onClick={() => {
            setShowCreateDialog(false);
            setEditingManufacturer(null);
            resetForm();
          }}
        >
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
          {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingManufacturer ? "Update" : "Create"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Manufacturers</h2>
          <p className="text-muted-foreground">Manage your product manufacturers and suppliers</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={(open) => { setShowCreateDialog(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <i className="fas fa-plus mr-2"></i>
              Add Manufacturer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Manufacturer</DialogTitle>
            </DialogHeader>
            <ManufacturerForm />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : manufacturers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <i className="fas fa-industry text-muted-foreground text-4xl mb-4"></i>
            <p className="text-muted-foreground">No manufacturers yet. Add your first one!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {manufacturers.map((m) => (
            <Card key={m.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <i className="fas fa-industry text-primary"></i>
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{m.name}</h3>
                      {m.contactPerson && (
                        <p className="text-sm text-muted-foreground">{m.contactPerson}</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground mb-4">
                  {m.email && (
                    <div className="flex items-center gap-2">
                      <i className="fas fa-envelope w-4"></i>
                      <span>{m.email}</span>
                    </div>
                  )}
                  {m.phone && (
                    <div className="flex items-center gap-2">
                      <i className="fas fa-phone w-4"></i>
                      <span>{m.phone}</span>
                    </div>
                  )}
                  {m.address && (
                    <div className="flex items-center gap-2">
                      <i className="fas fa-map-marker-alt w-4"></i>
                      <span className="truncate">{m.address}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Dialog open={editingManufacturer?.id === m.id} onOpenChange={(open) => { if (!open) { setEditingManufacturer(null); resetForm(); } }}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" onClick={() => openEdit(m)}>
                        <i className="fas fa-edit mr-1"></i> Edit
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Manufacturer</DialogTitle>
                      </DialogHeader>
                      <ManufacturerForm />
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-white hover:bg-red-600"
                    onClick={() => {
                      if (confirm(`Delete "${m.name}"?`)) {
                        deleteMutation.mutate(m.id);
                      }
                    }}
                  >
                    <i className="fas fa-trash mr-1"></i> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
