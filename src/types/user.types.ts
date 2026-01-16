import { Document } from "mongoose";

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  comparePassword: (password: string) => Promise<boolean>;
}
