import { SetNewPasswordForm } from "@/components/auth/set-new-password-form";

export default function ChangePasswordPage() {
  return (
    <SetNewPasswordForm
      heading="Set your password"
      description="For security, you need to set a new password before continuing."
      submitLabel="Set password & continue"
    />
  );
}
