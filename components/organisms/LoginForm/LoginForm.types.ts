export type LoginFormState = { error?: string; email?: string };

export type LoginFormProps = {
  defaultEmail?: string;
  notice?: string;
  action: (state: LoginFormState, formData: FormData) => Promise<LoginFormState>;
};
