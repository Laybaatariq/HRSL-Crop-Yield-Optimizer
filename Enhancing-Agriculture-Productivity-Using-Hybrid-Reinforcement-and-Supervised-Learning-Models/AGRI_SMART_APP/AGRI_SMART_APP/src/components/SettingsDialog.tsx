import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  Mail,
  Lock,
  Moon,
  Globe,
  LogOut,
  Edit,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
  const { theme, setTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) throw error;
        
        if (user) {
          setUserEmail(user.email || "");
          const fName = user.user_metadata?.first_name || "";
          const lName = user.user_metadata?.last_name || "";
          setUserName(`${fName} ${lName}`.trim() || "User");
          setFirstName(fName);
          setLastName(lName);
        }
      } catch (error) {
        // If we can't fetch user data, set defaults
        setUserEmail("user@example.com");
        setUserName("User");
      }
    };
    
    if (open) {
      fetchUserData();
    }
  }, [open]);

  const handleLogout = async () => {
    try {
      // Clear local storage first
      localStorage.removeItem('sb-klvgskiqcaqqrjlbnayj-auth-token');
      
      // Try to sign out from API (but don't fail if it errors)
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {
        // Ignore API errors - we've already cleared local storage
      });
      
      toast({
        title: t('settings.logout'),
        description: t('settings.loggedOut'),
      });
      
      onOpenChange(false);
      
      // Force navigation and reload to clear all state
      window.location.href = '/auth';
    } catch (error: any) {
      // Even if everything fails, still redirect
      window.location.href = '/auth';
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: t('settings.passwordMismatch'),
        description: t('settings.passwordMismatch'),
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        title: t('settings.weakPassword'),
        description: t('settings.weakPassword'),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      
      if (error) {
        toast({
          title: t('settings.passwordUpdateFailed'),
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: t('settings.changePassword'),
          description: t('settings.passwordUpdated'),
        });
        setShowPasswordDialog(false);
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: t('settings.networkError'),
        variant: "destructive",
      });
    }
    
    setLoading(false);
  };

  const handleProfileUpdate = async () => {
    setLoading(true);
    
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          first_name: firstName,
          last_name: lastName,
        }
      });
      
      if (error) {
        toast({
          title: t('settings.profileUpdateFailed'),
          description: error.message,
          variant: "destructive",
        });
      } else {
        setUserName(`${firstName} ${lastName}`.trim());
        toast({
          title: t('settings.editProfile'),
          description: t('settings.profileUpdated'),
        });
        setShowProfileDialog(false);
      }
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: t('settings.networkError'),
        variant: "destructive",
      });
    }
    
    setLoading(false);
  };

  const handleDarkModeToggle = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    toast({
      title: t('settings.darkMode'),
      description: newTheme === "dark" ? t('settings.darkModeEnabled') : t('settings.darkModeDisabled'),
    });
  };

  const handleLanguageChange = (newLanguage: string) => {
    i18n.changeLanguage(newLanguage);
    toast({
      title: t('settings.languageChanged'),
      description: `${t('settings.languageSetTo')} ${newLanguage === "en" ? "English" : "اردو"}`,
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">{t('settings.title')}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {t('settings.description')}
            </p>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Profile Section */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 bg-primary/10">
                <AvatarFallback className="text-xl font-semibold text-primary">
                  {userName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{userName || "User"}</h3>
                <p className="text-sm text-muted-foreground">{userEmail}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowProfileDialog(true)}>
                <Edit className="h-4 w-4" />
              </Button>
            </div>

          <Separator />

          {/* Profile Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="h-4 w-4" />
              <h4 className="font-medium text-foreground">{t('settings.profileSettings')}</h4>
            </div>

            <div className="space-y-3 pl-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  <span className="text-sm">{t('settings.editProfile')}</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowProfileDialog(true)}>
                  {t('settings.edit')}
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary" />
                  <span className="text-sm">{t('settings.changePassword')}</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowPasswordDialog(true)}>
                  {t('settings.change')}
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          {/* Preferences */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Globe className="h-4 w-4" />
              <h4 className="font-medium text-foreground">{t('settings.preferences')}</h4>
            </div>

            <div className="space-y-4 pl-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Moon className="h-4 w-4 text-primary" />
                  <Label htmlFor="dark-mode" className="text-sm cursor-pointer">
                    {t('settings.darkMode')}
                  </Label>
                </div>
                <Switch
                  id="dark-mode"
                  checked={theme === "dark"}
                  onCheckedChange={handleDarkModeToggle}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  <Label htmlFor="language" className="text-sm">
                    {t('settings.language')}
                  </Label>
                </div>
                <Select value={i18n.language} onValueChange={handleLanguageChange}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* Logout Button */}
          <Button
            onClick={handleLogout}
            variant="destructive"
            className="w-full"
          >
            <LogOut className="h-4 w-4 mr-2" />
            {t('settings.logout')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Password Change Dialog */}
    <AlertDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('settings.changePassword')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('settings.enterNewPassword')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">{t('settings.newPassword')}</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('settings.enterNewPassword')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">{t('settings.confirmPassword')}</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('settings.confirmNewPassword')}
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('settings.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={handlePasswordChange} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('settings.updatePassword')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Profile Edit Dialog */}
    <AlertDialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('settings.editProfile')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('settings.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-first-name">{t('settings.firstName')}</Label>
            <Input
              id="edit-first-name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Enter first name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-last-name">{t('settings.lastName')}</Label>
            <Input
              id="edit-last-name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder={t('settings.lastName')}
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('settings.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleProfileUpdate} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('settings.updateProfile')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default SettingsDialog;
