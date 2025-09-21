// Patient Database Integration Service
// Uses Prisma with Supabase PostgreSQL

const { getPrismaClient } = require("./index");

/**
 * Patient Database Service
 * Now uses Prisma with Supabase PostgreSQL for all patient data
 */
class PatientDatabaseService {
  constructor() {
    this.prisma = getPrismaClient();
  }

  /**
   * Initialize patient database (Prisma with Supabase)
   */
  async initialize() {
    try {
      // Test database connection
      await this.prisma.$connect();
      console.log("✅ Patient database (Supabase) connected");

      // Create sample patients if database is empty (development only)
      if (process.env.NODE_ENV === "development") {
        await this.createSamplePatientsIfEmpty();
      }

      return true;
    } catch (error) {
      console.error("❌ Patient database connection failed:", error);
      throw error;
    }
  }

  /**
   * Get patient data by phone number
   * @param {string} phoneNumber - Patient's phone number
   * @returns {Object|null} - Patient data or null if not found
   */
  async getPatientByPhone(phoneNumber) {
    try {
      // Remove whatsapp: prefix if present
      const cleanPhone = phoneNumber.replace("whatsapp:", "");

      const patient = await this.prisma.patient.findUnique({
        where: { phoneNumber: cleanPhone },
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 5, // Get last 5 messages
          },
          healthAnalyses: {
            orderBy: { createdAt: "desc" },
            take: 3, // Get last 3 analyses
          },
          monitoringJobs: {
            where: { status: "scheduled" },
            orderBy: { scheduledFor: "asc" },
          },
        },
      });

      return patient;
    } catch (error) {
      console.error("Error fetching patient by phone:", error);
      return null;
    }
  }

  /**
   * Get all patients for daily monitoring
   * @returns {Array} - Array of patient data
   */
  async getAllPatientsForMonitoring() {
    try {
      const patients = await this.prisma.patient.findMany({
        where: {
          monitoringEnabled: true,
          registrationComplete: true,
        },
        orderBy: { createdAt: "asc" },
      });

      return patients;
    } catch (error) {
      console.error("Error fetching patients for monitoring:", error);
      return [];
    }
  }

  /**
   * Create a new patient
   * @param {Object} patientData - Patient data
   * @returns {Object} - Created patient
   */
  async createPatient(patientData) {
    try {
      const patient = await this.prisma.patient.create({
        data: patientData,
      });

      console.log(
        `✅ Created new patient: ${patient.firstName} (${patient.phone})`
      );
      return patient;
    } catch (error) {
      console.error("Error creating patient:", error);
      throw error;
    }
  }

  /**
   * Update patient data
   * @param {string} phoneNumber - Patient's phone number
   * @param {Object} updates - Updates to apply
   * @returns {Object|null} - Updated patient or null
   */
  async updatePatient(phoneNumber, updates) {
    try {
      const cleanPhone = phoneNumber.replace("whatsapp:", "");

      const patient = await this.prisma.patient.update({
        where: { phoneNumber: cleanPhone },
        data: updates,
      });

      console.log(
        `✅ Updated patient: ${patient.firstName} (${patient.phone})`
      );
      return patient;
    } catch (error) {
      console.error("Error updating patient:", error);
      return null;
    }
  }

  /**
   * Create health analysis record
   * @param {Object} analysisData - Analysis data
   * @returns {Object} - Created analysis
   */
  async createHealthAnalysis(analysisData) {
    try {
      const analysis = await this.prisma.healthAnalysis.create({
        data: analysisData,
        include: { patient: true },
      });

      return analysis;
    } catch (error) {
      console.error("Error creating health analysis:", error);
      throw error;
    }
  }

  /**
   * Create monitoring job record
   * @param {Object} jobData - Job data
   * @returns {Object} - Created job
   */
  async createMonitoringJob(jobData) {
    try {
      const job = await this.prisma.monitoringJob.create({
        data: jobData,
      });

      return job;
    } catch (error) {
      console.error("Error creating monitoring job:", error);
      throw error;
    }
  }

  /**
   * Update monitoring job status
   * @param {string} jobId - BullMQ job ID
   * @param {string} status - New status
   * @param {DateTime} completedAt - Completion time
   */
  async updateMonitoringJobStatus(jobId, status, completedAt = null) {
    try {
      await this.prisma.monitoringJob.updateMany({
        where: { jobId },
        data: {
          status,
          completedAt,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error("Error updating monitoring job status:", error);
    }
  }

  /**
   * Create sample patients if database is empty (development only)
   */
  async createSamplePatientsIfEmpty() {
    try {
      const patientCount = await this.prisma.patient.count();

      if (patientCount === 0) {
        console.log("📝 Creating sample patients for development...");
        await this.createSamplePatients();
      }
    } catch (error) {
      console.error("Error checking/creating sample patients:", error);
    }
  }

  /**
   * Create sample patients (development helper)
   */
  async createSamplePatients() {
    const samplePatients = [
      {
        firstName: "Sarah",
        phoneNumber: "+19342120686", // Replace with test phone numbers
        zipcode: "10001",
        age: 72,

        // Consent and preferences
        optOutCustomMessages: false,
        consentGiven: true,
        consentDate: new Date("2024-01-15"),

        // Contact information
        familyContactName: "John Johnson",
        familyContactPhone: "+1987654321",
        familyContactRelation: "son",
        familyContactConsent: true,

        healthcareProviderName: "Dr. Smith",
        healthcareProviderHospital: "General Hospital",
        healthcareProviderPhone: "+1555111222",
        healthcareProviderConsent: true,

        // Medical information
        medications: ["metformin", "lisinopril", "atorvastatin"],
        preExistingConditions: ["diabetes", "hypertension", "high_cholesterol"],
        chronicConditions: ["diabetes", "hypertension"],
        hospital: "General Hospital",
        dialysisSchedule: null,

        // Lifestyle
        smoker: false,
        isPregnant: false,
        activityLevel: "moderate",

        // System fields
        riskLevel: "high",
        monitoringEnabled: true,
        preferredLanguage: "en",
        registrationComplete: true,
        lastHealthCheck: new Date("2024-01-15"),
      },
      {
        firstName: "Michael",
        phoneNumber: "+1987654321",
        zipcode: "90210",
        age: 45,

        // Consent and preferences
        optOutCustomMessages: false,
        consentGiven: true,
        consentDate: new Date("2024-01-10"),

        // Contact information
        familyContactName: "Lisa Chen",
        familyContactPhone: "+1555123456",
        familyContactRelation: "spouse",
        familyContactConsent: true,

        // Medical information
        medications: [],
        preExistingConditions: [],
        chronicConditions: [],

        // Lifestyle
        smoker: false,
        isPregnant: false,
        activityLevel: "high",

        // System fields
        riskLevel: "medium",
        monitoringEnabled: true,
        preferredLanguage: "en",
        registrationComplete: true,
        lastHealthCheck: new Date("2024-01-10"),
      },
      {
        firstName: "Maria",
        phoneNumber: "+1555123456",
        zipcode: "33101",
        age: 67,

        // Consent and preferences
        optOutCustomMessages: false,
        consentGiven: true,
        consentDate: new Date("2024-01-12"),

        // Contact information
        familyContactName: "Carlos Rodriguez",
        familyContactPhone: "+1444567890",
        familyContactRelation: "nephew",
        familyContactConsent: false, // Still pending family consent

        healthcareProviderName: "Dr. Martinez",
        healthcareProviderHospital: "Miami General",
        healthcareProviderPhone: "+1333444555",
        healthcareProviderConsent: true,

        // Medical information
        medications: ["furosemide", "metoprolol", "albuterol"],
        preExistingConditions: [
          "heart_disease",
          "copd",
          "kidney_disease",
          "dialysis",
        ],
        chronicConditions: ["heart_disease", "copd", "kidney_disease"],
        hospital: "Miami General",
        dialysisSchedule: "Monday, Wednesday, Friday - 8:00 AM",

        // Lifestyle
        smoker: true, // High risk
        isPregnant: false,
        activityLevel: "low",

        // System fields
        riskLevel: "high",
        monitoringEnabled: true,
        preferredLanguage: "es",
        registrationComplete: true,
        lastHealthCheck: new Date("2024-01-12"),
      },
    ];

    // Create sample patients
    for (const patientData of samplePatients) {
      try {
        await this.prisma.patient.create({ data: patientData });
        console.log(`✅ Created sample patient: ${patientData.firstName}`);
      } catch (error) {
        console.error(
          `❌ Error creating sample patient ${patientData.firstName}:`,
          error
        );
      }
    }

    console.log("🎉 Sample patients created successfully");
  }

  /**
   * Get patient statistics
   * @returns {Object} - Database statistics
   */
  async getPatientStats() {
    try {
      const totalPatients = await this.prisma.patient.count();
      const activePatients = await this.prisma.patient.count({
        where: { monitoringEnabled: true },
      });
      const completedRegistrations = await this.prisma.patient.count({
        where: { registrationComplete: true },
      });
      const highRiskPatients = await this.prisma.patient.count({
        where: { riskLevel: "high" },
      });

      return {
        totalPatients,
        activePatients,
        completedRegistrations,
        highRiskPatients,
        registrationCompletionRate:
          totalPatients > 0
            ? Math.round((completedRegistrations / totalPatients) * 100)
            : 0,
      };
    } catch (error) {
      console.error("Error fetching patient stats:", error);
      return {
        totalPatients: 0,
        activePatients: 0,
        completedRegistrations: 0,
        highRiskPatients: 0,
        registrationCompletionRate: 0,
      };
    }
  }

  /**
   * Search patients by criteria
   * @param {Object} criteria - Search criteria
   * @returns {Array} - Array of patients
   */
  async searchPatients(criteria = {}) {
    try {
      const where = {};

      if (criteria.riskLevel) where.riskLevel = criteria.riskLevel;
      if (criteria.zipcode) where.zipcode = criteria.zipcode;
      if (criteria.age) {
        if (criteria.age.min) where.age = { gte: criteria.age.min };
        if (criteria.age.max)
          where.age = { ...where.age, lte: criteria.age.max };
      }
      if (criteria.chronicConditions) {
        where.chronicConditions = { hasSome: criteria.chronicConditions };
      }

      const patients = await this.prisma.patient.findMany({
        where,
        include: {
          healthAnalyses: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return patients;
    } catch (error) {
      console.error("Error searching patients:", error);
      return [];
    }
  }
}

module.exports = {
  PatientDatabaseService,
};
