import { AiCredential } from "../models/ai-credential.model.js";
import { encrypt, decrypt, maskApiKey } from "../utils/crypto.utils.js";
import type { AICredentials, AIProvider } from "../types/ai.types.js";

export interface AICredentialStatusResponse {
  isConnected: boolean;
  provider?: AIProvider;
  maskedKey?: string;
  model?: string;
}

export async function getUserCredentialStatus(
  userId: string,
): Promise<AICredentialStatusResponse> {
  const credential = await AiCredential.findOne({ userId }).lean();
  if (!credential) {
    return { isConnected: false };
  }
  return {
    isConnected: true,
    provider: credential.provider,
    maskedKey: credential.maskedKey,
    model: credential.model,
  };
}

export async function getDecryptedCredentials(
  userId: string,
): Promise<AICredentials | null> {
  const credential = await AiCredential.findOne({ userId });
  if (!credential) {
    return null;
  }

  try {
    const apiKey = decrypt({
      encrypted: credential.encrypted,
      iv: credential.iv,
      authTag: credential.authTag,
    });

    return {
      apiKey,
      provider: credential.provider,
      model: credential.model,
    };
  } catch (err) {
    console.error(`Failed to decrypt credentials for user ${userId}:`, err);
    return null;
  }
}

export async function saveUserCredentials(
  userId: string,
  data: { provider: AIProvider; apiKey: string; model?: string },
): Promise<AICredentialStatusResponse> {
  const { encrypted, iv, authTag } = encrypt(data.apiKey.trim());
  const maskedKey = maskApiKey(data.apiKey.trim());

  await AiCredential.findOneAndUpdate(
    { userId },
    {
      provider: data.provider,
      model: data.model?.trim() || undefined,
      encrypted,
      iv,
      authTag,
      maskedKey,
    },
    { upsert: true, new: true },
  );

  return {
    isConnected: true,
    provider: data.provider,
    maskedKey,
    model: data.model?.trim(),
  };
}

export async function deleteUserCredentials(
  userId: string,
): Promise<{ isConnected: boolean }> {
  await AiCredential.deleteOne({ userId });
  return { isConnected: false };
}
