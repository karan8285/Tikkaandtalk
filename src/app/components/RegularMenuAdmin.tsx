import { projectId, publicAnonKey } from "/utils/supabase/info";
import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Plus, Edit, Trash2, RefreshCw, Search, Image as ImageIcon, PackageX, Award, ChefHat } from "lucide-react";
import { toast } from "sonner";
import { formatIDR } from "../lib/currency";
import { MenuImageUpload } from "./MenuImageUpload";

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-e5e192fb`;

interface MenuItem {
  id: string;
  category: string;
  name: string;
  price: number;
  image?: string;
  isAvailable: boolean;
  outOfStock?: boolean;
  isBestSeller?: boolean;
  isChefSpecial?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RegularMenuAdminProps {
  customToken: string;
}

export function RegularMenuAdmin({ customToken }: RegularMenuAdminProps) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingImage, setLoadingImage] = useState(false);
  
  // Dialog states
  const [addDialog, setAddDialog] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  
  // Form states
  const [formData, setFormData] = useState({
    category: "",
    name: "",
    price: "",
    image: "",
    isBestSeller: false,
    isChefSpecial: false,
  });

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/admin/regular-menu`, {
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setItems(data.items || []);
        
        // Extract unique categories
        const uniqueCategories = [...new Set(data.items.map((item: MenuItem) => item.category))];
        setCategories(uniqueCategories.sort());
      } else {
        toast.error("Failed to load menu items");
      }
    } catch (error) {
      console.error("Failed to fetch menu items:", error);
      toast.error("Failed to load menu items");
    } finally {
      setLoading(false);
    }
  };

  const handleSeedData = async () => {
    if (!confirm("This will seed the menu with all items from the JSON file. Continue?")) {
      return;
    }

    try {
      setSeeding(true);
      const response = await fetch(`${API_BASE}/admin/regular-menu/seed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Menu seeded successfully!");
        fetchItems();
      } else {
        toast.error(data.error || "Failed to seed menu");
      }
    } catch (error) {
      console.error("Failed to seed menu:", error);
      toast.error("Failed to seed menu");
    } finally {
      setSeeding(false);
    }
  };

  const handleUpdateImages = async () => {
    if (!confirm("This will update all menu items with appropriate images based on dish names. Continue?")) {
      return;
    }

    try {
      setLoadingImage(true);
      const response = await fetch(`${API_BASE}/admin/regular-menu/update-images`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message || "Images updated successfully!");
        fetchItems();
      } else {
        toast.error(data.error || "Failed to update images");
      }
    } catch (error) {
      console.error("Failed to update images:", error);
      toast.error("Failed to update images");
    } finally {
      setLoadingImage(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.category || !formData.name || !formData.price) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/admin/regular-menu`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: JSON.stringify({
          category: formData.category,
          name: formData.name,
          price: parseFloat(formData.price),
          image: formData.image,
          isBestSeller: formData.isBestSeller,
          isChefSpecial: formData.isChefSpecial,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Menu item added successfully!");
        setAddDialog(false);
        setFormData({ category: "", name: "", price: "", image: "", isBestSeller: false, isChefSpecial: false });
        fetchItems();
      } else {
        toast.error(data.error || "Failed to add menu item");
      }
    } catch (error) {
      console.error("Failed to add menu item:", error);
      toast.error("Failed to add menu item");
    }
  };

  const handleEdit = async () => {
    if (!selectedItem || !formData.category || !formData.name || !formData.price) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/admin/regular-menu/${selectedItem.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: JSON.stringify({
          category: formData.category,
          name: formData.name,
          price: parseFloat(formData.price),
          image: formData.image,
          isBestSeller: formData.isBestSeller,
          isChefSpecial: formData.isChefSpecial,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Menu item updated successfully!");
        setEditDialog(false);
        setSelectedItem(null);
        setFormData({ category: "", name: "", price: "", image: "", isBestSeller: false, isChefSpecial: false });
        fetchItems();
      } else {
        toast.error(data.error || "Failed to update menu item");
      }
    } catch (error) {
      console.error("Failed to update menu item:", error);
      toast.error("Failed to update menu item");
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;

    try {
      const response = await fetch(`${API_BASE}/admin/regular-menu/${selectedItem.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Menu item deleted successfully!");
        setDeleteDialog(false);
        setSelectedItem(null);
        fetchItems();
      } else {
        toast.error(data.error || "Failed to delete menu item");
      }
    } catch (error) {
      console.error("Failed to delete menu item:", error);
      toast.error("Failed to delete menu item");
    }
  };

  const handleToggleAvailability = async (item: MenuItem) => {
    try {
      const response = await fetch(`${API_BASE}/admin/regular-menu/${item.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: JSON.stringify({
          isAvailable: !item.isAvailable,
        }),
      });

      if (response.ok) {
        toast.success(`Item ${!item.isAvailable ? "enabled" : "disabled"}`);
        fetchItems();
      } else {
        toast.error("Failed to toggle availability");
      }
    } catch (error) {
      console.error("Failed to toggle availability:", error);
      toast.error("Failed to toggle availability");
    }
  };

  const handleToggleOutOfStock = async (item: MenuItem) => {
    try {
      const response = await fetch(`${API_BASE}/admin/menu/${item.id}/stock`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: JSON.stringify({
          outOfStock: !item.outOfStock,
        }),
      });

      if (response.ok) {
        toast.success(`Item marked as ${!item.outOfStock ? "out of stock" : "in stock"}`);
        fetchItems();
      } else {
        toast.error("Failed to toggle stock status");
      }
    } catch (error) {
      console.error("Failed to toggle stock status:", error);
      toast.error("Failed to toggle stock status");
    }
  };

  const handleToggleBadge = async (item: MenuItem, field: "isBestSeller" | "isChefSpecial") => {
    try {
      const response = await fetch(`${API_BASE}/admin/regular-menu/${item.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
          "X-Custom-Auth": customToken,
        },
        body: JSON.stringify({
          [field]: !item[field],
        }),
      });

      if (response.ok) {
        const label = field === "isBestSeller" ? "Best Seller" : "Chef Special";
        toast.success(`${item.name} ${!item[field] ? `marked as ${label}` : `removed from ${label}`}`);
        fetchItems();
      } else {
        toast.error("Failed to update badge");
      }
    } catch (error) {
      console.error("Failed to toggle badge:", error);
      toast.error("Failed to update badge");
    }
  };

  const openAddDialog = () => {
    setFormData({ category: "", name: "", price: "", image: "", isBestSeller: false, isChefSpecial: false });
    setAddDialog(true);
  };

  const openEditDialog = (item: MenuItem) => {
    setSelectedItem(item);
    setFormData({
      category: item.category,
      name: item.name,
      price: item.price.toString(),
      image: item.image || "",
      isBestSeller: item.isBestSeller || false,
      isChefSpecial: item.isChefSpecial || false,
    });
    setEditDialog(true);
  };

  const openDeleteDialog = (item: MenuItem) => {
    setSelectedItem(item);
    setDeleteDialog(true);
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  if (loading) {
    return <div className="p-6 text-center">Loading menu items...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Regular Menu Management</h2>
          <p className="text-muted-foreground text-sm">Manage your restaurant menu items</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={fetchItems} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          {items.length === 0 && (
            <Button onClick={handleSeedData} disabled={seeding} size="sm">
              {seeding ? "Seeding..." : "Seed Menu Data"}
            </Button>
          )}
          {items.length > 0 && (
            <Button onClick={handleUpdateImages} disabled={loadingImage} variant="outline" size="sm">
              <ImageIcon className="w-4 h-4 mr-2" />
              {loadingImage ? "Updating..." : "Update All Images"}
            </Button>
          )}
          <Button onClick={openAddDialog} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            type="text"
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filter by category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold">{items.length}</div>
          <div className="text-sm text-muted-foreground">Total Items</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">{categories.length}</div>
          <div className="text-sm text-muted-foreground">Categories</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">
            {items.filter((item) => item.isAvailable).length}
          </div>
          <div className="text-sm text-muted-foreground">Available</div>
        </Card>
        <Card className="p-4">
          <div className="text-2xl font-bold">
            {items.filter((item) => !item.isAvailable).length}
          </div>
          <div className="text-sm text-muted-foreground">Unavailable</div>
        </Card>
        <Card className="p-4 border-amber-200 bg-amber-50">
          <div className="text-2xl font-bold text-amber-700">
            {items.filter((item) => item.isBestSeller).length}
          </div>
          <div className="text-sm text-amber-600 flex items-center gap-1">
            <Award className="w-3 h-3" /> Best Sellers
          </div>
        </Card>
        <Card className="p-4 border-purple-200 bg-purple-50">
          <div className="text-2xl font-bold text-purple-700">
            {items.filter((item) => item.isChefSpecial).length}
          </div>
          <div className="text-sm text-purple-600 flex items-center gap-1">
            <ChefHat className="w-3 h-3" /> Chef Specials
          </div>
        </Card>
      </div>

      {/* Items Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left p-4">Category</th>
                <th className="text-left p-4">Name</th>
                <th className="text-left p-4">Price</th>
                <th className="text-left p-4">Badges</th>
                <th className="text-left p-4">Status</th>
                <th className="text-right p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center p-8 text-muted-foreground">
                    {items.length === 0 ? "No menu items yet. Click 'Seed Menu Data' to populate." : "No items match your filters."}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="border-b hover:bg-gray-50">
                    <td className="p-4">
                      <Badge variant="outline">{item.category}</Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        {item.isBestSeller && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                            <Award className="w-3 h-3" />
                          </span>
                        )}
                        {item.isChefSpecial && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">
                            <ChefHat className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">{formatIDR(item.price)}</td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1.5">
                        <button
                          onClick={() => handleToggleBadge(item, "isBestSeller")}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border ${
                            item.isBestSeller
                              ? "bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200"
                              : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200"
                          }`}
                        >
                          <Award className="w-3.5 h-3.5" />
                          Best Seller
                        </button>
                        <button
                          onClick={() => handleToggleBadge(item, "isChefSpecial")}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border ${
                            item.isChefSpecial
                              ? "bg-purple-100 text-purple-700 border-purple-300 hover:bg-purple-200"
                              : "bg-gray-50 text-gray-400 border-gray-200 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200"
                          }`}
                        >
                          <ChefHat className="w-3.5 h-3.5" />
                          Chef Special
                        </button>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-2">
                        <Button
                          onClick={() => handleToggleAvailability(item)}
                          variant={item.isAvailable ? "default" : "secondary"}
                          size="sm"
                        >
                          {item.isAvailable ? "Available" : "Unavailable"}
                        </Button>
                        <Button
                          onClick={() => handleToggleOutOfStock(item)}
                          variant={item.outOfStock ? "destructive" : "outline"}
                          size="sm"
                          className="whitespace-nowrap"
                        >
                          <PackageX className="w-4 h-4 mr-1" />
                          {item.outOfStock ? "Out of Stock" : "In Stock"}
                        </Button>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        <Button onClick={() => openEditDialog(item)} variant="outline" size="sm">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={() => openDeleteDialog(item)}
                          variant="destructive"
                          size="sm"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Menu Item</DialogTitle>
            <DialogDescription>Add a new item to the regular menu</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="add-category">Category</Label>
              <Input
                id="add-category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Appetizer Veg"
              />
            </div>
            <div>
              <Label htmlFor="add-name">Name</Label>
              <Input
                id="add-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Paneer Tikka"
              />
            </div>
            <div>
              <Label htmlFor="add-price">Price (Rp)</Label>
              <Input
                id="add-price"
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="e.g., 89000"
              />
            </div>
            <div>
              <MenuImageUpload
                value={formData.image}
                onChange={(url) => setFormData({ ...formData, image: url })}
                customToken={customToken}
                label="Dish Image"
                context="Regular Menu Card"
                recommendedSize="400 x 300 px"
                aspectRatio="4:3"
                maxSizeMB={5}
              />
            </div>
            {/* Badge Toggles */}
            <div>
              <Label className="mb-2 block">Special Badges</Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isBestSeller: !formData.isBestSeller })}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                    formData.isBestSeller
                      ? "bg-amber-100 text-amber-700 border-amber-300"
                      : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-amber-50 hover:border-amber-200"
                  }`}
                >
                  <Award className="w-4 h-4" />
                  Best Seller
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isChefSpecial: !formData.isChefSpecial })}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                    formData.isChefSpecial
                      ? "bg-purple-100 text-purple-700 border-purple-300"
                      : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-purple-50 hover:border-purple-200"
                  }`}
                >
                  <ChefHat className="w-4 h-4" />
                  Chef Special
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd}>Add Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Menu Item</DialogTitle>
            <DialogDescription>Update menu item details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-category">Category</Label>
              <Input
                id="edit-category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-price">Price (Rp)</Label>
              <Input
                id="edit-price"
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              />
            </div>
            <div>
              <MenuImageUpload
                value={formData.image}
                onChange={(url) => setFormData({ ...formData, image: url })}
                customToken={customToken}
                label="Dish Image"
                context="Regular Menu Card"
                recommendedSize="400 x 300 px"
                aspectRatio="4:3"
                maxSizeMB={5}
              />
            </div>
            {/* Badge Toggles */}
            <div>
              <Label className="mb-2 block">Special Badges</Label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isBestSeller: !formData.isBestSeller })}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                    formData.isBestSeller
                      ? "bg-amber-100 text-amber-700 border-amber-300"
                      : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-amber-50 hover:border-amber-200"
                  }`}
                >
                  <Award className="w-4 h-4" />
                  Best Seller
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isChefSpecial: !formData.isChefSpecial })}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
                    formData.isChefSpecial
                      ? "bg-purple-100 text-purple-700 border-purple-300"
                      : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-purple-50 hover:border-purple-200"
                  }`}
                >
                  <ChefHat className="w-4 h-4" />
                  Chef Special
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Menu Item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedItem?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
