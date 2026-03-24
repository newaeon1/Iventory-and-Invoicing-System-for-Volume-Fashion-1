import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface SidebarProps {
  currentPage: string;
  onClose?: () => void;
}

const navigationItems = [
  { id: "dashboard", path: "/", icon: "fas fa-chart-line", label: "Dashboard", roles: ["Admin", "Manager", "Staff", "Viewer"] },
  { id: "products", path: "/products", icon: "fas fa-box", label: "Products", roles: ["Admin", "Manager", "Staff", "Viewer"] },
  { id: "add-product", path: "/add-product", icon: "fas fa-plus", label: "Add Product", roles: ["Admin", "Manager", "Staff"] },
  { id: "bulk-upload", path: "/bulk-upload", icon: "fas fa-upload", label: "Bulk Upload", roles: ["Admin", "Manager"] },
  { id: "manufacturers", path: "/manufacturers", icon: "fas fa-industry", label: "Manufacturers", roles: ["Admin", "Manager", "Staff"] },
  { id: "invoices", path: "/invoices", icon: "fas fa-file-invoice", label: "Invoices", roles: ["Admin", "Manager", "Staff", "Viewer"] },
  { id: "create-invoice", path: "/create-invoice", icon: "fas fa-plus-circle", label: "Create Invoice", roles: ["Admin", "Manager", "Staff"] },
  { id: "customers", path: "/customers", icon: "fas fa-address-book", label: "Customers", roles: ["Admin", "Manager", "Staff"] },
  { id: "reports", path: "/reports", icon: "fas fa-chart-bar", label: "Reports", roles: ["Admin", "Manager"] },
  { id: "users", path: "/users", icon: "fas fa-users", label: "User Management", roles: ["Admin"] },
  { id: "activity-logs", path: "/activity-logs", icon: "fas fa-history", label: "Activity Logs", roles: ["Admin", "Manager"] },
];

export default function Sidebar({ currentPage, onClose }: SidebarProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Logout even if request fails
    }
    window.location.href = '/';
  };

  const userInitials = user?.firstName && user?.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : user?.email?.[0]?.toUpperCase() || 'U';

  const filteredNavItems = navigationItems.filter(item => 
    item.roles.includes(user?.role || 'Viewer')
  );

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col h-screen">
      <div className="p-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <img 
                src="/attached_assets/image_1757421254360.png" 
                alt="Volume Fashion Logo" 
                className="w-8 h-8 rounded-md object-cover"
              />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Volume Fashion</h1>
              <p className="text-xs text-muted-foreground">Inventory & Invoicing</p>
            </div>
          </div>
          
          {/* Mobile Close Button */}
          {onClose && (
            <button 
              onClick={onClose}
              className="lg:hidden text-muted-foreground hover:text-foreground transition-colors p-1"
              data-testid="button-close-sidebar"
            >
              <i className="fas fa-times w-5 h-5"></i>
            </button>
          )}
        </div>

        <nav className="space-y-2">
          {filteredNavItems.map((item) => (
            <Link
              key={item.id}
              href={item.path}
              className={cn(
                "w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                currentPage === item.id && "bg-primary text-primary-foreground"
              )}
              data-testid={`nav-${item.id}`}
            >
              <i className={`${item.icon} w-4 h-4`}></i>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>

      {/* User Profile Section */}
      <div className="mt-auto p-6 border-t border-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-accent-foreground">{userInitials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email}
            </p>
            <p className="text-xs text-muted-foreground">{user?.role || 'Viewer'}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-logout"
          >
            <i className="fas fa-sign-out-alt w-4 h-4"></i>
          </button>
        </div>
      </div>
    </aside>
  );
}
