import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPassword() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data: ForgotPasswordForm) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (response.ok) {
        toast({
          title: "Reset Link Sent",
          description: "If an account with that email exists, you will receive a password reset link.",
          variant: "default",
        });
        // Reset form
        form.reset();
      } else {
        const error = await response.json();
        toast({
          title: "Request Failed",
          description: error.message || "Failed to process request",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Request Failed",
        description: "Unable to connect to server. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <div className="w-full max-w-md">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-20 h-20 flex items-center justify-center">
              <img 
                src="/attached_assets/image_1757421254360.png" 
                alt="Volume Fashion Logo" 
                className="w-16 h-16 rounded-full object-cover"
              />
            </div>
            <CardTitle className="text-2xl font-bold text-white">Forgot Password</CardTitle>
            <p className="text-gray-300">Enter your email to receive a password reset link</p>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-200">Email Address</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="email"
                          placeholder="Enter your email address"
                          disabled={isLoading}
                          data-testid="input-email"
                          className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-400 focus:border-blue-500"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white" 
                  disabled={isLoading}
                  data-testid="button-send-reset"
                >
                  {isLoading ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Sending...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-paper-plane mr-2"></i>
                      Send Reset Link
                    </>
                  )}
                </Button>

                <div className="text-center mt-4">
                  <button
                    type="button"
                    onClick={() => window.location.href = '/login'}
                    className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    data-testid="link-back-to-login"
                  >
                    ← Back to Login
                  </button>
                </div>
              </form>
            </Form>

            <div className="mt-6 p-4 bg-gray-700 rounded-lg text-left">
              <p className="text-sm font-medium text-gray-200 mb-2">Volume Fashion Collection</p>
              <div className="text-xs text-gray-300 space-y-1">
                <p>Address: 4006-4008Room, 5Floor,changjiang Internation Garment Building ,No.931,Renmingbei Road , Yuexiu District,Guangzhou.China</p>
                <p>Phone: <a href="tel:+8613288689165" className="text-blue-400 hover:text-blue-300">+86 132 8868 9165</a></p>
                <p>
                  WhatsApp:
                  <a 
                    href="https://wa.link/mb5xbk" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-green-400 hover:text-green-300 ml-1"
                  >
                    +962796100166
                  </a>
                  . 
                  <a 
                    href="https://wa.link/g3bblj" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-green-400 hover:text-green-300"
                  >
                    +8613660002778
                  </a>
                </p>
                <p>
                  <a 
                    href="https://instagram.com/volume_fashion1" 
                    target="_blank" 
                    style={{textDecoration: 'none', color: 'inherit'}}
                    className="inline-flex items-center"
                  >
                    <i className="fab fa-instagram" style={{fontSize: '20px', verticalAlign: 'middle', marginRight: '5px', color: '#E1306C'}}></i>
                    <span>@volume_fashion1</span>
                  </a>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}