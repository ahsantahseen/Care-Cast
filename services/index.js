// Centralized services module to eliminate redundancy
const { Twilio } = require("twilio");
const { PrismaClient } = require("@prisma/client");
const IORedis = require("ioredis");
require("dotenv").config();

// Singleton instances to prevent multiple connections
let prismaInstance = null;
let twilioInstance = null;
let redisInstance = null;

/**
 * Get shared Prisma client instance
 * @returns {PrismaClient}
 */
const getPrismaClient = () => {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      log:
        process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],
    });

    // Graceful shutdown handling
    process.on("beforeExit", async () => {
      await prismaInstance.$disconnect();
    });
  }
  return prismaInstance;
};

/**
 * Get shared Twilio client instance
 * @returns {Twilio}
 */
const getTwilioClient = () => {
  if (!twilioInstance) {
    if (!process.env.TWILIO_SID || !process.env.TWILIO_AUTH_TOKEN) {
      throw new Error(
        "Missing required Twilio environment variables: TWILIO_SID, TWILIO_AUTH_TOKEN"
      );
    }

    twilioInstance = new Twilio(
      process.env.TWILIO_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
  return twilioInstance;
};

/**
 * Get shared Redis connection instance
 * @returns {IORedis}
 */
const getRedisConnection = () => {
  if (!redisInstance) {
    redisInstance = new IORedis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT) || 6379,
      maxRetriesPerRequest: null,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true,

      // Connection pool settings
      family: 4,
      keepAlive: true,

      // Error handling
      onError: (error) => {
        console.error("[Redis Connection Error]:", error);
      },
    });

    // Graceful shutdown handling
    process.on("beforeExit", async () => {
      await redisInstance.quit();
    });
  }
  return redisInstance;
};

/**
 * WhatsApp configuration object
 */
const getWhatsAppConfig = () => {
  const sandboxNumber = process.env.TWILIO_WHATSAPP_SANDBOX_NUMBER;

  if (!sandboxNumber) {
    throw new Error(
      "Missing required environment variable: TWILIO_WHATSAPP_SANDBOX_NUMBER"
    );
  }

  return {
    from: `whatsapp:${sandboxNumber}`,
    sandboxNumber: sandboxNumber,
    formattedFrom: `whatsapp:${sandboxNumber}`,

    // Helper function to format phone numbers
    formatPhoneNumber: (phoneNumber) => {
      return phoneNumber.startsWith("whatsapp:")
        ? phoneNumber
        : `whatsapp:${phoneNumber}`;
    },

    // Helper function to extract phone number
    extractPhoneNumber: (whatsappNumber) => {
      return whatsappNumber.replace("whatsapp:", "");
    },
  };
};

/**
 * Validate all required environment variables
 */
const validateEnvironment = () => {
  const required = [
    "TWILIO_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_WHATSAPP_SANDBOX_NUMBER",
  ];

  const recommended = [
    "BASE_URL", // For status webhook callbacks
  ];

  const missing = required.filter((key) => !process.env[key]);
  const missingRecommended = recommended.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  if (missingRecommended.length > 0) {
    console.warn(
      `⚠️  Missing recommended environment variables: ${missingRecommended.join(
        ", "
      )}`
    );
    console.warn("   Status webhook delivery tracking may not work properly");
  }

  console.log("✅ Environment validation passed");
};

/**
 * Initialize all services and validate environment
 */
const initializeServices = async () => {
  try {
    console.log("🔧 Initializing shared services...");

    // Validate environment first
    validateEnvironment();

    // Initialize database connection
    const prisma = getPrismaClient();
    await prisma.$connect();
    console.log("✅ Database connected");

    // Test Redis connection
    const redis = getRedisConnection();
    await redis.ping();
    console.log("✅ Redis connected");

    // Test Twilio client
    const twilio = getTwilioClient();
    const whatsapp = getWhatsAppConfig();
    console.log(`✅ Twilio configured (WhatsApp: ${whatsapp.sandboxNumber})`);

    console.log("🚀 All services initialized successfully");

    return {
      prisma,
      twilio,
      redis,
      whatsapp,
    };
  } catch (error) {
    console.error("❌ Service initialization failed:", error);
    process.exit(1);
  }
};

/**
 * Graceful shutdown for all services
 */
const shutdownServices = async () => {
  console.log("🔄 Shutting down services...");

  try {
    if (prismaInstance) {
      await prismaInstance.$disconnect();
      console.log("✅ Database disconnected");
    }

    if (redisInstance) {
      await redisInstance.quit();
      console.log("✅ Redis disconnected");
    }

    console.log("✅ All services shut down gracefully");
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
  }
};

module.exports = {
  // Service getters
  getPrismaClient,
  getTwilioClient,
  getRedisConnection,
  getWhatsAppConfig,

  // Initialization
  initializeServices,
  shutdownServices,
  validateEnvironment,
};
