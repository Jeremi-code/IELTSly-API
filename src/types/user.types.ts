import { Document } from "mongoose";

export interface IUser {
  _id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image?: string;
  firstName?: string;
  lastName?: string;
  passwordHash?: string;
  comparePassword?: (password: string) => Promise<boolean>;
}


