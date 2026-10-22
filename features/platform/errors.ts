export class FieldError extends Error {
  constructor(
    public field: string,
    message: string,
  ) {
    super(message);
  }
}

export const SLUG_TAKEN = "Este endereço já está em uso.";
export const EMAIL_TAKEN = "Este e-mail já tem conta na plataforma.";

export class NotFoundError extends Error {
  constructor(message = "Registro não encontrado.") {
    super(message);
  }
}
