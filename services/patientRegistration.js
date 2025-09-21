// Comprehensive patient registration flow
// Collects all required patient information step by step

const REGISTRATION_STEPS = {
  WELCOME: "WELCOME",
  FIRST_NAME: "FIRST_NAME",
  ZIP_CODE: "ZIP_CODE",
  AGE: "AGE",
  CUSTOM_MESSAGES: "CUSTOM_MESSAGES",
  FAMILY_CONTACT: "FAMILY_CONTACT",
  FAMILY_CONTACT_INFO: "FAMILY_CONTACT_INFO",
  HEALTHCARE_PROVIDER: "HEALTHCARE_PROVIDER",
  HEALTHCARE_PROVIDER_INFO: "HEALTHCARE_PROVIDER_INFO",
  MEDICATIONS: "MEDICATIONS",
  MEDICATIONS_LIST: "MEDICATIONS_LIST",
  CHRONIC_CONDITIONS: "CHRONIC_CONDITIONS",
  HOSPITAL: "HOSPITAL",
  DIALYSIS_SCHEDULE: "DIALYSIS_SCHEDULE",
  SMOKING: "SMOKING",
  PREGNANCY: "PREGNANCY",
  ACTIVITY_LEVEL: "ACTIVITY_LEVEL",
  FINAL_CONSENT: "FINAL_CONSENT",
  COMPLETED: "COMPLETED",
};

const CHRONIC_CONDITIONS = [
  "diabetes",
  "heart_disease",
  "high_blood_pressure",
  "kidney_disease",
  "liver_disease",
  "lung_disease_copd",
  "asthma",
  "cancer",
  "dialysis",
  "stroke_history",
  "mental_health",
  "arthritis",
  "obesity",
];

class PatientRegistrationFlow {
  constructor() {
    this.currentRegistrations = new Map(); // Store incomplete registrations
  }

  /**
   * Get welcome message for new patients
   */
  getWelcomeMessage() {
    return (
      `🏥 *Welcome to Climate Health Monitoring!*\n\n` +
      `I'm here to help protect you from extreme weather health risks.\n\n` +
      `To provide personalized care, I need to collect some information. This will take about 5 minutes.\n\n` +
      `⚠️ *Important*: This service provides health guidance but is not a substitute for medical care. In emergencies, call 911.\n\n` +
      `Let's start! What's your first name?`
    );
  }

  /**
   * Process registration step
   * @param {string} phoneNumber - Patient's phone number
   * @param {string} input - User's input
   * @returns {Object} - {message: string, isComplete: boolean, patientData: Object}
   */
  processStep(phoneNumber, input) {
    // Get or create registration data
    let regData = this.currentRegistrations.get(phoneNumber) || {
      step: REGISTRATION_STEPS.FIRST_NAME,
      data: {},
    };

    const response = this.handleStep(regData.step, input, regData.data);

    // Update registration data
    if (response.nextStep) {
      regData.step = response.nextStep;
      regData.data = { ...regData.data, ...response.updateData };
      this.currentRegistrations.set(phoneNumber, regData);
    }

    // Registration complete
    if (response.isComplete) {
      this.currentRegistrations.delete(phoneNumber);
    }

    return {
      message: response.message,
      isComplete: response.isComplete,
      patientData: response.isComplete ? regData.data : null,
    };
  }

  /**
   * Handle individual registration step
   */
  handleStep(currentStep, input, currentData) {
    const trimmedInput = (input || "").trim();

    switch (currentStep) {
      case REGISTRATION_STEPS.FIRST_NAME:
        return this.handleFirstName(trimmedInput);

      case REGISTRATION_STEPS.ZIP_CODE:
        return this.handleZipCode(trimmedInput, currentData);

      case REGISTRATION_STEPS.AGE:
        return this.handleAge(trimmedInput, currentData);

      case REGISTRATION_STEPS.CUSTOM_MESSAGES:
        return this.handleCustomMessages(trimmedInput, currentData);

      case REGISTRATION_STEPS.FAMILY_CONTACT:
        return this.handleFamilyContact(trimmedInput, currentData);

      case REGISTRATION_STEPS.FAMILY_CONTACT_INFO:
        return this.handleFamilyContactInfo(trimmedInput, currentData);

      case REGISTRATION_STEPS.HEALTHCARE_PROVIDER:
        return this.handleHealthcareProvider(trimmedInput, currentData);

      case REGISTRATION_STEPS.HEALTHCARE_PROVIDER_INFO:
        return this.handleHealthcareProviderInfo(trimmedInput, currentData);

      case REGISTRATION_STEPS.MEDICATIONS:
        return this.handleMedications(trimmedInput, currentData);

      case REGISTRATION_STEPS.MEDICATIONS_LIST:
        return this.handleMedicationsList(trimmedInput, currentData);

      case REGISTRATION_STEPS.CHRONIC_CONDITIONS:
        return this.handleChronicConditions(trimmedInput, currentData);

      case REGISTRATION_STEPS.HOSPITAL:
        return this.handleHospital(trimmedInput, currentData);

      case REGISTRATION_STEPS.DIALYSIS_SCHEDULE:
        return this.handleDialysisSchedule(trimmedInput, currentData);

      case REGISTRATION_STEPS.SMOKING:
        return this.handleSmoking(trimmedInput, currentData);

      case REGISTRATION_STEPS.PREGNANCY:
        return this.handlePregnancy(trimmedInput, currentData);

      case REGISTRATION_STEPS.ACTIVITY_LEVEL:
        return this.handleActivityLevel(trimmedInput, currentData);

      case REGISTRATION_STEPS.FINAL_CONSENT:
        return this.handleFinalConsent(trimmedInput, currentData);

      default:
        return {
          message:
            "There was an error in registration. Let's start over. What's your first name?",
          nextStep: REGISTRATION_STEPS.FIRST_NAME,
          updateData: {},
        };
    }
  }

  handleFirstName(input) {
    if (!input || input.length < 1) {
      return {
        message: "Please tell me your first name:",
        nextStep: REGISTRATION_STEPS.FIRST_NAME,
        updateData: {},
      };
    }

    if (input.length > 50 || /\d/.test(input)) {
      return {
        message: "Please enter just your first name (no numbers):",
        nextStep: REGISTRATION_STEPS.FIRST_NAME,
        updateData: {},
      };
    }

    const firstName =
      input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();

    return {
      message: `Nice to meet you, ${firstName}! 😊\n\nWhat's your ZIP code? This helps us provide local weather alerts.`,
      nextStep: REGISTRATION_STEPS.ZIP_CODE,
      updateData: { firstName },
    };
  }

  handleZipCode(input, currentData) {
    const zipMatch = input.match(/(\d{5})/);

    if (!zipMatch) {
      return {
        message: `${currentData.firstName}, please enter a valid 5-digit ZIP code (like 10001):`,
        nextStep: REGISTRATION_STEPS.ZIP_CODE,
        updateData: {},
      };
    }

    const zipcode = zipMatch[1];

    return {
      message: `Thanks ${currentData.firstName}! Now, how old are you? (Just type the number)`,
      nextStep: REGISTRATION_STEPS.AGE,
      updateData: { zipcode },
    };
  }

  handleAge(input, currentData) {
    const age = parseInt(input);

    if (isNaN(age) || age < 1 || age > 120) {
      return {
        message: `${currentData.firstName}, please enter a valid age between 1 and 120:`,
        nextStep: REGISTRATION_STEPS.AGE,
        updateData: {},
      };
    }

    let ageMessage = `Got it, ${currentData.firstName}!\n\n`;

    if (age >= 65) {
      ageMessage +=
        "I'll provide extra guidance since extreme weather affects seniors more.\n\n";
    }

    ageMessage +=
      `Do you want to opt out of customized health messages?\n\n` +
      `Reply:\n` +
      `• "No" - I want personalized messages (recommended)\n` +
      `• "Yes" - Send me only basic alerts`;

    return {
      message: ageMessage,
      nextStep: REGISTRATION_STEPS.CUSTOM_MESSAGES,
      updateData: { age },
    };
  }

  handleCustomMessages(input, currentData) {
    const lowerInput = input.toLowerCase();
    let optOut = false;

    if (lowerInput.includes("yes") || lowerInput.includes("opt out")) {
      optOut = true;
    }

    const message = optOut
      ? `${currentData.firstName}, you'll receive basic weather alerts only.\n\n`
      : `${currentData.firstName}, you'll receive personalized health guidance! 👍\n\n`;

    return {
      message:
        message +
        `Would you like to add a family member or neighbor as an emergency contact?\n\n` +
        `Reply:\n` +
        `• "Yes" - Add emergency contact\n` +
        `• "No" - Skip for now`,
      nextStep: REGISTRATION_STEPS.FAMILY_CONTACT,
      updateData: { optOutCustomMessages: optOut },
    };
  }

  handleFamilyContact(input, currentData) {
    const lowerInput = input.toLowerCase();

    if (lowerInput.includes("no") || lowerInput.includes("skip")) {
      return {
        message:
          `${currentData.firstName}, would you like to add your healthcare provider's contact information?\n\n` +
          `This helps in emergencies.\n\n` +
          `Reply:\n` +
          `• "Yes" - Add healthcare provider\n` +
          `• "No" - Skip for now`,
        nextStep: REGISTRATION_STEPS.HEALTHCARE_PROVIDER,
        updateData: { familyContact: null },
      };
    }

    return {
      message:
        `${currentData.firstName}, please provide your emergency contact information in this format:\n\n` +
        `Name, Relationship, Phone Number\n\n` +
        `Example: "John Smith, Son, +19342120686"`,
      nextStep: REGISTRATION_STEPS.FAMILY_CONTACT_INFO,
      updateData: {},
    };
  }

  handleFamilyContactInfo(input, currentData) {
    // Parse contact info (Name, Relationship, Phone)
    const parts = input.split(",").map((p) => p.trim());

    if (parts.length < 3) {
      return {
        message: `Please provide complete information:\nName, Relationship, Phone Number\n\nExample: "John Smith, Son, +19342120686"`,
        nextStep: REGISTRATION_STEPS.FAMILY_CONTACT_INFO,
        updateData: {},
      };
    }

    const [name, relationship, phone] = parts;

    // Basic phone validation
    const phoneMatch = phone.match(/[\+\d\-\(\)\s]{10,}/);
    if (!phoneMatch) {
      return {
        message: `Please enter a valid phone number. Format:\nName, Relationship, Phone Number\n\nExample: "John Smith, Son, +19342120686"`,
        nextStep: REGISTRATION_STEPS.FAMILY_CONTACT_INFO,
        updateData: {},
      };
    }

    const familyContact = {
      name,
      relationship,
      phone: phone,
      consentGiven: false, // Will need to get consent separately
    };

    return {
      message:
        `${currentData.firstName}, I've added ${name} as your emergency contact.\n\n` +
        `⚠️ *Important*: We'll need their consent before contacting them in emergencies.\n\n` +
        `Would you like to add your healthcare provider's contact information?\n\n` +
        `Reply:\n` +
        `• "Yes" - Add healthcare provider\n` +
        `• "No" - Skip for now`,
      nextStep: REGISTRATION_STEPS.HEALTHCARE_PROVIDER,
      updateData: { familyContact },
    };
  }

  handleHealthcareProvider(input, currentData) {
    const lowerInput = input.toLowerCase();

    if (lowerInput.includes("no") || lowerInput.includes("skip")) {
      return {
        message:
          `${currentData.firstName}, are you currently taking any medications?\n\n` +
          `This helps us warn you if weather conditions might affect your medications.\n\n` +
          `Reply:\n` +
          `• "Yes" - I take medications\n` +
          `• "No" - No medications`,
        nextStep: REGISTRATION_STEPS.MEDICATIONS,
        updateData: { healthcareProvider: null },
      };
    }

    return {
      message:
        `${currentData.firstName}, please provide your healthcare provider information:\n\n` +
        `Doctor Name, Hospital/Clinic, Phone Number\n\n` +
        `Example: "Dr. Smith, General Hospital, +1555111222"`,
      nextStep: REGISTRATION_STEPS.HEALTHCARE_PROVIDER_INFO,
      updateData: {},
    };
  }

  handleHealthcareProviderInfo(input, currentData) {
    const parts = input.split(",").map((p) => p.trim());

    if (parts.length < 2) {
      return {
        message: `Please provide at least:\nDoctor Name, Hospital/Clinic\n\nOptional: Phone Number\n\nExample: "Dr. Smith, General Hospital, +1555111222"`,
        nextStep: REGISTRATION_STEPS.HEALTHCARE_PROVIDER_INFO,
        updateData: {},
      };
    }

    const [doctorName, hospital, phone] = parts;

    const healthcareProvider = {
      name: doctorName,
      hospital: hospital,
      phone: phone || null,
      consentGiven: false, // Will need consent for contact
    };

    return {
      message:
        `${currentData.firstName}, I've added ${doctorName} at ${hospital}.\n\n` +
        `Are you currently taking any medications?\n\n` +
        `This helps us warn you if weather conditions might affect your medications.\n\n` +
        `Reply:\n` +
        `• "Yes" - I take medications\n` +
        `• "No" - No medications`,
      nextStep: REGISTRATION_STEPS.MEDICATIONS,
      updateData: { healthcareProvider },
    };
  }

  handleMedications(input, currentData) {
    const lowerInput = input.toLowerCase();

    if (lowerInput.includes("no") || lowerInput.includes("none")) {
      return {
        message: this.getChronicConditionsMessage(currentData.firstName),
        nextStep: REGISTRATION_STEPS.CHRONIC_CONDITIONS,
        updateData: { medications: [] },
      };
    }

    return {
      message:
        `${currentData.firstName}, please list your medications separated by commas:\n\n` +
        `Example: "Metformin, Lisinopril, Aspirin"\n\n` +
        `(This helps us provide weather-related medication warnings)`,
      nextStep: REGISTRATION_STEPS.MEDICATIONS_LIST,
      updateData: {},
    };
  }

  handleMedicationsList(input, currentData) {
    const medications = input
      .split(",")
      .map((med) => med.trim().toLowerCase())
      .filter((med) => med.length > 0);

    if (medications.length === 0) {
      return {
        message: `Please list your medications, or reply "none" if you don't take any:`,
        nextStep: REGISTRATION_STEPS.MEDICATIONS_LIST,
        updateData: {},
      };
    }

    return {
      message:
        `${currentData.firstName}, I've recorded your medications.\n\n` +
        this.getChronicConditionsMessage(currentData.firstName),
      nextStep: REGISTRATION_STEPS.CHRONIC_CONDITIONS,
      updateData: { medications },
    };
  }

  getChronicConditionsMessage(firstName) {
    return (
      `${firstName}, do you have any chronic health conditions?\n\n` +
      `Reply with the numbers that apply (separated by commas):\n\n` +
      `1. Diabetes\n` +
      `2. Heart Disease\n` +
      `3. High Blood Pressure\n` +
      `4. Kidney Disease\n` +
      `5. Liver Disease\n` +
      `6. Lung Disease/COPD\n` +
      `7. Asthma\n` +
      `8. Cancer\n` +
      `9. Dialysis\n` +
      `10. Stroke History\n` +
      `11. Mental Health Conditions\n` +
      `12. Arthritis\n` +
      `13. Obesity\n\n` +
      `Example: "1,3,6" or "None"`
    );
  }

  handleChronicConditions(input, currentData) {
    const lowerInput = input.toLowerCase();
    let conditions = [];

    if (!lowerInput.includes("none")) {
      // Parse numbers
      const numbers = input.match(/\d+/g);
      if (numbers) {
        const conditionMap = {
          1: "diabetes",
          2: "heart_disease",
          3: "high_blood_pressure",
          4: "kidney_disease",
          5: "liver_disease",
          6: "lung_disease_copd",
          7: "asthma",
          8: "cancer",
          9: "dialysis",
          10: "stroke_history",
          11: "mental_health",
          12: "arthritis",
          13: "obesity",
        };

        conditions = numbers.map((num) => conditionMap[num]).filter((c) => c);
      }
    }

    // Check if dialysis was selected
    if (conditions.includes("dialysis")) {
      return {
        message:
          `${currentData.firstName}, I see you're on dialysis. What's your dialysis schedule?\n\n` +
          `Example: "Monday, Wednesday, Friday at 8:00 AM"\n\n` +
          `This helps us coordinate health monitoring around your treatments.`,
        nextStep: REGISTRATION_STEPS.DIALYSIS_SCHEDULE,
        updateData: { chronicConditions: conditions },
      };
    }

    // Check if any conditions need hospital info
    const needsHospital = conditions.some((c) =>
      ["heart_disease", "kidney_disease", "cancer", "stroke_history"].includes(
        c
      )
    );

    if (needsHospital && !currentData.healthcareProvider) {
      return {
        message:
          `${currentData.firstName}, which hospital do you usually visit for your condition?\n\n` +
          `Just enter the hospital name:`,
        nextStep: REGISTRATION_STEPS.HOSPITAL,
        updateData: { chronicConditions: conditions },
      };
    }

    return {
      message:
        `${currentData.firstName}, do you smoke?\n\n` +
        `Reply:\n` +
        `• "Yes" - I smoke\n` +
        `• "No" - I don't smoke`,
      nextStep: REGISTRATION_STEPS.SMOKING,
      updateData: { chronicConditions: conditions },
    };
  }

  handleDialysisSchedule(input, currentData) {
    const schedule = input.trim();

    if (schedule.length < 5) {
      return {
        message: `Please provide your dialysis schedule:\n\nExample: "Monday, Wednesday, Friday at 8:00 AM"`,
        nextStep: REGISTRATION_STEPS.DIALYSIS_SCHEDULE,
        updateData: {},
      };
    }

    const needsHospital = !currentData.healthcareProvider;

    if (needsHospital) {
      return {
        message: `${currentData.firstName}, which hospital do you go to for dialysis?`,
        nextStep: REGISTRATION_STEPS.HOSPITAL,
        updateData: { dialysisSchedule: schedule },
      };
    }

    return {
      message:
        `${currentData.firstName}, do you smoke?\n\n` +
        `Reply:\n` +
        `• "Yes" - I smoke\n` +
        `• "No" - I don't smoke`,
      nextStep: REGISTRATION_STEPS.SMOKING,
      updateData: { dialysisSchedule: schedule },
    };
  }

  handleHospital(input, currentData) {
    const hospital = input.trim();

    if (hospital.length < 2) {
      return {
        message: `Please enter the hospital name:`,
        nextStep: REGISTRATION_STEPS.HOSPITAL,
        updateData: {},
      };
    }

    return {
      message:
        `${currentData.firstName}, do you smoke?\n\n` +
        `Reply:\n` +
        `• "Yes" - I smoke\n` +
        `• "No" - I don't smoke`,
      nextStep: REGISTRATION_STEPS.SMOKING,
      updateData: { hospital },
    };
  }

  handleSmoking(input, currentData) {
    const lowerInput = input.toLowerCase();
    const smoker = lowerInput.includes("yes");

    const nextMessage =
      currentData.age && currentData.age <= 50 && !smoker
        ? `${currentData.firstName}, are you currently pregnant?\n\n` +
          `Reply:\n` +
          `• "Yes" - I'm pregnant\n` +
          `• "No" - Not pregnant`
        : this.getActivityLevelMessage(currentData.firstName);

    const nextStep =
      currentData.age && currentData.age <= 50 && !smoker
        ? REGISTRATION_STEPS.PREGNANCY
        : REGISTRATION_STEPS.ACTIVITY_LEVEL;

    return {
      message: nextMessage,
      nextStep,
      updateData: { smoker },
    };
  }

  handlePregnancy(input, currentData) {
    const lowerInput = input.toLowerCase();
    const pregnant = lowerInput.includes("yes");

    return {
      message: this.getActivityLevelMessage(currentData.firstName),
      nextStep: REGISTRATION_STEPS.ACTIVITY_LEVEL,
      updateData: { pregnant },
    };
  }

  getActivityLevelMessage(firstName) {
    return (
      `${firstName}, what's your typical activity level?\n\n` +
      `Reply:\n` +
      `• "High" - I exercise regularly/work physically demanding job\n` +
      `• "Moderate" - I'm somewhat active\n` +
      `• "Low" - I'm mostly sedentary`
    );
  }

  handleActivityLevel(input, currentData) {
    const lowerInput = input.toLowerCase();
    let activityLevel = "moderate";

    if (lowerInput.includes("high")) {
      activityLevel = "high";
    } else if (lowerInput.includes("low")) {
      activityLevel = "low";
    }

    return {
      message: this.getFinalConsentMessage(currentData.firstName),
      nextStep: REGISTRATION_STEPS.FINAL_CONSENT,
      updateData: { activityLevel },
    };
  }

  getFinalConsentMessage(firstName) {
    return (
      `${firstName}, we're almost done! 🎉\n\n` +
      `*Final Consent:*\n\n` +
      `By replying "I AGREE", you consent to:\n\n` +
      `✅ Receiving health alerts and monitoring messages\n` +
      `✅ Emergency contact outreach if needed\n` +
      `✅ Weather-based health guidance\n` +
      `✅ Medication safety alerts\n\n` +
      `You can opt out anytime by texting "STOP".\n\n` +
      `Reply "I AGREE" to complete registration.`
    );
  }

  handleFinalConsent(input, currentData) {
    const lowerInput = input.toLowerCase();

    if (!lowerInput.includes("agree")) {
      return {
        message: `${currentData.firstName}, please reply "I AGREE" to complete registration, or "CANCEL" to stop:`,
        nextStep: REGISTRATION_STEPS.FINAL_CONSENT,
        updateData: {},
      };
    }

    const completedData = {
      ...currentData,
      consentGiven: true,
      consentDate: new Date().toISOString(),
      registrationComplete: true,
      monitoringEnabled: true,
      preferredLanguage: "en",
      riskLevel: this.calculateInitialRiskLevel(currentData),
    };

    return {
      message: this.getCompletionMessage(currentData.firstName),
      isComplete: true,
      updateData: completedData,
    };
  }

  getCompletionMessage(firstName) {
    return (
      `🎉 *Registration Complete!*\n\n` +
      `Thank you ${firstName}! You're now enrolled in our Climate Health Monitoring system.\n\n` +
      `✅ You'll receive daily health check-ins\n` +
      `✅ Weather-based health alerts\n` +
      `✅ Personalized guidance during extreme weather\n` +
      `✅ Emergency monitoring when needed\n\n` +
      `💬 *How are you feeling today?* Tell me about any symptoms you're experiencing, or just say "good" if you're feeling fine.\n\n` +
      `Type "HELP" anytime for assistance.`
    );
  }

  calculateInitialRiskLevel(patientData) {
    let riskScore = 0;

    // Age factor
    if (patientData.age >= 65) riskScore += 2;
    else if (patientData.age >= 50) riskScore += 1;

    // Chronic conditions
    const highRiskConditions = [
      "heart_disease",
      "kidney_disease",
      "diabetes",
      "copd",
      "dialysis",
    ];
    const hasHighRisk = patientData.chronicConditions?.some((c) =>
      highRiskConditions.includes(c)
    );
    if (hasHighRisk) riskScore += 2;

    // Lifestyle factors
    if (patientData.smoker) riskScore += 1;
    if (patientData.isPregnant) riskScore += 1;
    if (patientData.activityLevel === "low") riskScore += 1;

    // Determine risk level
    if (riskScore >= 4) return "high";
    if (riskScore >= 2) return "medium";
    return "low";
  }

  /**
   * Check if phone number is in registration process
   */
  isInRegistration(phoneNumber) {
    return this.currentRegistrations.has(phoneNumber);
  }

  /**
   * Clear registration data (for testing or restart)
   */
  clearRegistration(phoneNumber) {
    this.currentRegistrations.delete(phoneNumber);
  }
}

module.exports = {
  PatientRegistrationFlow,
  REGISTRATION_STEPS,
  CHRONIC_CONDITIONS,
};
