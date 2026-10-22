export type AcceptInviteFormState = { error?: string; fieldErrors?: Record<string, string> };

export type AcceptInviteFormProps = {
  token: string;
  existingUser?: boolean;
  action: (state: AcceptInviteFormState, formData: FormData) => Promise<AcceptInviteFormState>;
};
