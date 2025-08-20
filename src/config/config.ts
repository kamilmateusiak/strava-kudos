import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const EnvSchema = z.object({
    STRAVA_CLIENT_ID: z.string().min(1),
    STRAVA_CLIENT_SECRET: z.string().min(1),
    PORT: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(1).max(65535)),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

type EnvConfig = z.infer<typeof EnvSchema>;

class Config {
    private config: EnvConfig;

    constructor() {
        this.config = this.validate();
    }

    private validate(): EnvConfig {
        try {
            return EnvSchema.parse(process.env);
        } catch (error) {
            if (error instanceof z.ZodError) {
                const missingVars = error.errors.map(err => err.path.join('.')).join(', ');
                throw new Error(`Missing or invalid environment variables: ${missingVars}`);
            }
            throw error;
        }
    }

    get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
        return this.config[key];
    }
}

export const config = new Config();
