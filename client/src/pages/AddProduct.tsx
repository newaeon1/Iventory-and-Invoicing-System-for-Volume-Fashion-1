import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";

const AVAILABLE_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

const FASHION_COLORS = [
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Red", hex: "#DC2626" },
  { name: "Blue", hex: "#2563EB" },
  { name: "Navy", hex: "#1E3A5F" },
  { name: "Green", hex: "#16A34A" },
  { name: "Yellow", hex: "#EAB308" },
  { name: "Pink", hex: "#EC4899" },
  { name: "Purple", hex: "#9333EA" },
  { name: "Orange", hex: "#EA580C" },
  { name: "Brown", hex: "#92400E" },
  { name: "Grey", hex: "#6B7280" },
  { name: "Beige", hex: "#D2B48C" },
  { name: "Cream", hex: "#FFFDD0" },
  { name: "Gold", hex: "#CA8A04" },
  { name: "Silver", hex: "#A8A9AD" },
  { name: "Maroon", hex: "#800000" },
  { name: "Olive", hex: "#6B8E23" },
  { name: "Teal", hex: "#0D9488" },
  { name: "Coral", hex: "#F97316" },
  { name: "Burgundy", hex: "#722F37" },
  { name: "Khaki", hex: "#C3B091" },
  { name: "Lavender", hex: "#A78BFA" },
  { name: "Turquoise", hex: "#06B6D4" },
];

const addProductSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  productName: z.string().min(1, "Product name is required"),
  color: z.string().min(1, "Color is required"),
  price: z.number().gt(0, "Selling price must be greater than 0"),
  costPrice: z.number().min(0, "Cost price must be 0 or greater").optional(),
  manufacturerId: z.string().optional(),
  manufacturer: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
});

type AddProductForm = z.infer<typeof addProductSchema>;

interface Manufacturer {
  id: string;
  name: string;
}

export default function AddProduct() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [sizeBreakdown, setSizeBreakdown] = useState<Record<string, number>>({});
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [showNewManufacturerDialog, setShowNewManufacturerDialog] = useState(false);
  const [newManufacturerName, setNewManufacturerName] = useState("");

  const { data: manufacturers = [] } = useQuery<Manufacturer[]>({
    queryKey: ["/api/manufacturers"],
  });

  const form = useForm<AddProductForm>({
    resolver: zodResolver(addProductSchema),
    defaultValues: {
      productId: "",
      productName: "",
      color: "",
      price: 0,
      costPrice: undefined,
      manufacturerId: "",
      manufacturer: "",
      category: "",
      description: "",
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/products", data);
      return response.json();
    },
    onSuccess: (product) => {
      toast({ title: "Success", description: "Product created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      navigate("/products");
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Unauthorized", description: "You are logged out. Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/"; }, 500);
        return;
      }
      toast({ title: "Error", description: "Failed to create product", variant: "destructive" });
    },
  });

  const updateProductImageMutation = useMutation({
    mutationFn: async ({ productId, files }: { productId: string; files: File[] }) => {
      const formData = new FormData();
      files.forEach((file) => formData.append("images", file));
      const response = await fetch(`/api/products/${productId}/image`, {
        method: "PUT",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Upload failed");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Product images and QR code generated successfully" });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Unauthorized", description: "You are logged out. Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/"; }, 500);
        return;
      }
      toast({ title: "Warning", description: "Product created but failed to upload images", variant: "destructive" });
    },
  });

  const createManufacturerMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", "/api/manufacturers", { name });
      return response.json();
    },
    onSuccess: (manufacturer: Manufacturer) => {
      toast({ title: "Success", description: `Manufacturer "${manufacturer.name}" created` });
      queryClient.invalidateQueries({ queryKey: ["/api/manufacturers"] });
      form.setValue("manufacturerId", manufacturer.id);
      form.setValue("manufacturer", manufacturer.name);
      setShowNewManufacturerDialog(false);
      setNewManufacturerName("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create manufacturer", variant: "destructive" });
    },
  });

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const totalImages = selectedImages.length + files.length;
    if (totalImages > 10) {
      toast({ title: "Error", description: `Maximum 10 images allowed. You can add ${10 - selectedImages.length} more.`, variant: "destructive" });
      return;
    }

    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "Error", description: `"${file.name}" exceeds 5MB limit`, variant: "destructive" });
        return;
      }
    }

    const newImages = [...selectedImages, ...files];
    const newPreviews = [...imagePreviews, ...files.map(f => URL.createObjectURL(f))];
    setSelectedImages(newImages);
    setImagePreviews(newPreviews);
    toast({ title: "Success", description: `${files.length} image(s) added (${newImages.length}/10)` });
    // Reset the input so the same file(s) can be re-selected
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(imagePreviews[index]);
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const updateSizeQty = (size: string, qty: number) => {
    setSizeBreakdown(prev => {
      const updated = { ...prev };
      if (qty <= 0) {
        delete updated[size];
      } else {
        updated[size] = qty;
      }
      return updated;
    });
  };

  const totalQuantity = Object.values(sizeBreakdown).reduce((sum, qty) => sum + qty, 0);
  const activeSizes = Object.keys(sizeBreakdown).filter(s => sizeBreakdown[s] > 0);

  const onSubmit = async (data: AddProductForm) => {
    if (selectedImages.length === 0) {
      toast({ title: "Image Required", description: "Please upload at least one product image before saving", variant: "destructive" });
      return;
    }

    if (totalQuantity === 0) {
      toast({ title: "Size Required", description: "Please specify at least one size with quantity", variant: "destructive" });
      return;
    }

    try {
      const productData = {
        ...data,
        price: data.price.toString(),
        costPrice: data.costPrice != null ? data.costPrice.toString() : null,
        quantity: totalQuantity,
        size: activeSizes.join(", "),
        sizeBreakdown,
      };

      const product = await createProductMutation.mutateAsync(productData);

      if (selectedImages.length > 0 && product.id) {
        updateProductImageMutation.mutate({ productId: product.id, files: selectedImages });
      }
    } catch (error) {
      // handled by mutation
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Card className="shadow-xl border-0 bg-gradient-to-br from-background to-muted/20">
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-2xl mb-4">
              <i className="fas fa-plus text-primary text-2xl"></i>
            </div>
            <h3 className="text-3xl font-bold text-foreground mb-2">Add New Product</h3>
            <p className="text-muted-foreground text-lg">Create a new product for your fashion inventory</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {/* Product Basic Info */}
              <div className="bg-background/50 rounded-xl border p-6">
                <h4 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-tag text-primary text-sm"></i>
                  </div>
                  Basic Information
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="productId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium flex items-center gap-2">
                          <i className="fas fa-barcode text-muted-foreground"></i>
                          Product ID
                        </FormLabel>
                        <FormControl>
                          <div className="flex gap-3">
                            <Input placeholder="F00XXX" {...field} className="flex-1 h-12 text-base" />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                const randomId = `PROD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
                                field.onChange(randomId);
                              }}
                              className="h-12 px-6 bg-primary/5 hover:bg-primary/10 border-primary/20"
                            >
                              <i className="fas fa-dice mr-2"></i>
                              Generate
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="productName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium flex items-center gap-2">
                          <i className="fas fa-tshirt text-muted-foreground"></i>
                          Product Name
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="Enter product name" {...field} className="h-12 text-base" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Product Details */}
              <div className="bg-background/50 rounded-xl border p-6">
                <h4 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-palette text-primary text-sm"></i>
                  </div>
                  Product Details
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium flex items-center gap-2">
                          <i className="fas fa-tags text-muted-foreground"></i>
                          Category (Optional)
                        </FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-12 text-base">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Dresses">Dresses</SelectItem>
                            <SelectItem value="Tops">Tops</SelectItem>
                            <SelectItem value="Bottoms">Bottoms</SelectItem>
                            <SelectItem value="Shoes">Shoes</SelectItem>
                            <SelectItem value="Accessories">Accessories</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Color Multi-Select */}
                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem className="mt-6">
                      <FormLabel className="text-base font-medium flex items-center gap-2">
                        <i className="fas fa-palette text-muted-foreground"></i>
                        Colors <span className="text-red-500">*</span>
                        <span className="text-sm font-normal text-muted-foreground ml-1">
                          ({selectedColors.length} selected)
                        </span>
                      </FormLabel>

                      {/* Selected colors display */}
                      {selectedColors.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3">
                          {selectedColors.map((colorName) => {
                            const colorObj = FASHION_COLORS.find(c => c.name === colorName);
                            return (
                              <span
                                key={colorName}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary/10 text-foreground border border-primary/30"
                              >
                                <span
                                  className="w-3 h-3 rounded-full border border-gray-300 shrink-0"
                                  style={{ backgroundColor: colorObj?.hex || "#888" }}
                                />
                                {colorName}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = selectedColors.filter(c => c !== colorName);
                                    setSelectedColors(updated);
                                    field.onChange(updated.join(", "));
                                  }}
                                  className="ml-0.5 hover:text-red-500 transition-colors"
                                >
                                  <i className="fas fa-times text-xs"></i>
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Color swatches grid */}
                      <FormControl>
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                          {FASHION_COLORS.map((color) => {
                            const isSelected = selectedColors.includes(color.name);
                            const isLight = ["White", "Cream", "Beige", "Yellow", "Khaki"].includes(color.name);
                            return (
                              <button
                                key={color.name}
                                type="button"
                                onClick={() => {
                                  const updated = isSelected
                                    ? selectedColors.filter(c => c !== color.name)
                                    : [...selectedColors, color.name];
                                  setSelectedColors(updated);
                                  field.onChange(updated.join(", "));
                                }}
                                className={`relative flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-all hover:scale-105 ${
                                  isSelected
                                    ? "border-primary bg-primary/5 shadow-md"
                                    : "border-transparent bg-muted/30 hover:border-muted-foreground/30"
                                }`}
                              >
                                <div className="relative">
                                  <span
                                    className={`block w-8 h-8 rounded-full border ${isLight ? "border-gray-300" : "border-transparent"} shadow-sm`}
                                    style={{ backgroundColor: color.hex }}
                                  />
                                  {isSelected && (
                                    <span className="absolute inset-0 flex items-center justify-center">
                                      <i className={`fas fa-check text-xs ${isLight ? "text-gray-700" : "text-white"}`}></i>
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] font-medium text-foreground leading-tight text-center">
                                  {color.name}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Size Breakdown */}
              <div className="bg-background/50 rounded-xl border p-6">
                <h4 className="text-xl font-semibold text-foreground mb-2 flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-ruler text-primary text-sm"></i>
                  </div>
                  Size Breakdown
                </h4>
                <p className="text-sm text-muted-foreground mb-6">Specify the number of pieces for each size</p>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                  {AVAILABLE_SIZES.map((size) => (
                    <div key={size} className="text-center">
                      <Label className="text-sm font-semibold text-foreground block mb-2">{size}</Label>
                      <Input
                        type="number"
                        min="0"
                        value={sizeBreakdown[size] || ""}
                        onChange={(e) => updateSizeQty(size, parseInt(e.target.value) || 0)}
                        placeholder="0"
                        className="h-12 text-center text-lg font-medium"
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-3 bg-muted rounded-lg flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Sizes: {activeSizes.length > 0 ? activeSizes.map(s => `${sizeBreakdown[s]}${s}`).join(", ") : "None selected"}
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    Total: {totalQuantity} pieces
                  </span>
                </div>
              </div>

              {/* Pricing & Manufacturer */}
              <div className="bg-background/50 rounded-xl border p-6">
                <h4 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-dollar-sign text-primary text-sm"></i>
                  </div>
                  Pricing & Source
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium flex items-center gap-2">
                          <i className="fas fa-dollar-sign text-muted-foreground"></i>
                          Selling Price ($) <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              min="0.01"
                              {...field}
                              onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              className="h-12 text-base pl-8"
                            />
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3">
                              <span className="text-muted-foreground text-base">$</span>
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="costPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium flex items-center gap-2">
                          <i className="fas fa-coins text-muted-foreground"></i>
                          Cost Price ($)
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              min="0"
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                              className="h-12 text-base pl-8"
                            />
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3">
                              <span className="text-muted-foreground text-base">$</span>
                            </div>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  <FormField
                    control={form.control}
                    name="manufacturerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-medium flex items-center gap-2">
                          <i className="fas fa-industry text-muted-foreground"></i>
                          Manufacturer
                        </FormLabel>
                        <div className="flex gap-2">
                          <Select
                            onValueChange={(value) => {
                              field.onChange(value);
                              const m = manufacturers.find(m => m.id === value);
                              if (m) form.setValue("manufacturer", m.name);
                            }}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="h-12 text-base flex-1">
                                <SelectValue placeholder="Select manufacturer" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {manufacturers.map((m) => (
                                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Dialog open={showNewManufacturerDialog} onOpenChange={setShowNewManufacturerDialog}>
                            <DialogTrigger asChild>
                              <Button type="button" variant="outline" className="h-12 px-4">
                                <i className="fas fa-plus"></i>
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-sm">
                              <DialogHeader>
                                <DialogTitle>New Manufacturer</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <Label>Name</Label>
                                  <Input
                                    value={newManufacturerName}
                                    onChange={(e) => setNewManufacturerName(e.target.value)}
                                    placeholder="Manufacturer name"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        if (newManufacturerName.trim()) {
                                          createManufacturerMutation.mutate(newManufacturerName.trim());
                                        }
                                      }
                                    }}
                                  />
                                </div>
                                <Button
                                  onClick={() => {
                                    if (newManufacturerName.trim()) {
                                      createManufacturerMutation.mutate(newManufacturerName.trim());
                                    }
                                  }}
                                  disabled={!newManufacturerName.trim() || createManufacturerMutation.isPending}
                                  className="w-full"
                                >
                                  {createManufacturerMutation.isPending ? "Creating..." : "Create Manufacturer"}
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Description */}
              <div className="bg-background/50 rounded-xl border p-6">
                <h4 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-align-left text-primary text-sm"></i>
                  </div>
                  Description
                </h4>
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base font-medium flex items-center gap-2">
                        <i className="fas fa-file-text text-muted-foreground"></i>
                        Description (Optional)
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Product description..." {...field} className="h-12 text-base" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Image Upload */}
              <div className="bg-background/50 rounded-xl border p-6">
                <div className="mb-4">
                  <label className="text-lg font-medium text-foreground">
                    Product Images <span className="text-red-500">*</span>: Upload up to 10 images
                  </label>
                  <p className="text-sm text-muted-foreground mt-1">
                    JPG, PNG, or WebP up to 5MB each ({selectedImages.length}/10 selected)
                  </p>
                </div>
                {selectedImages.length < 10 && (
                  <Input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    onChange={handleImageSelect}
                    className="w-full"
                  />
                )}
                {imagePreviews.length > 0 && (
                  <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {imagePreviews.map((preview, index) => (
                      <div key={index} className="relative group">
                        <img src={preview} alt={`Preview ${index + 1}`} className="w-full h-24 object-cover rounded-lg border" />
                        <button
                          type="button"
                          onClick={() => removeImage(index)}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                        {index === 0 && (
                          <span className="absolute bottom-1 left-1 text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded font-medium">
                            Main
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-center gap-6 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/products")}
                  className="h-12 px-8 text-base border-2 hover:bg-muted/50"
                >
                  <i className="fas fa-times mr-2"></i>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createProductMutation.isPending || selectedImages.length === 0}
                  className="h-12 px-8 text-base bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg"
                >
                  {createProductMutation.isPending ? (
                    <>
                      <i className="fas fa-spinner animate-spin mr-2"></i>
                      Saving Product...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-save mr-2"></i>
                      Save Product
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
