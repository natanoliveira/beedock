export type LoginFormState = { error?: string; email?: string };

export type LoginFormProps = {
  action: (state: LoginFormState, formData: FormData) => Promise<LoginFormState>;
};
