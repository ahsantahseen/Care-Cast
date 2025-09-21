require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const {
  whatsappQueue,
  scheduleHealthCheckup,
  scheduleDailyCheckup,
  cancelHealthCheckups,
  updateMonitoringFrequency,
} = require("./queue");

// Import MedGemma-only analysis (no legacy heuristics)
const { analyzeSymptoms } = require("./utils/medgemmaAnalysis");
const {
  getPrismaClient,
  getTwilioClient,
  getWhatsAppConfig,
  initializeServices,
} = require("./services");

const app = express();
const prisma = getPrismaClient();
const whatsappConfig = getWhatsAppConfig();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Function to detect poll responses - STRICT matching for actual poll replies only
const detectPollResponse = (messageText) => {
  const text = messageText.toLowerCase().trim();

  // Check for numbered responses (1-5) - EXACT match only
  if (/^[1-5]$/.test(text)) {
    const responseMap = {
      1: "much_better",
      2: "slightly_better",
      3: "same_symptoms",
      4: "worse_condition",
      5: "emergency_help",
    };
    return responseMap[text];
  }

  // Check for EXACT button IDs (from interactive messages)
  const buttonIds = [
    "much_better",
    "slightly_better",
    "same_symptoms",
    "worse_condition",
    "emergency_help",
  ];
  if (buttonIds.includes(text)) {
    return text;
  }

  // Check for VERY SPECIFIC poll response patterns only (not general health messages)
  // Only match if it's clearly a status update response, not a symptom description

  // "Better" responses - must be short and direct
  if (
    /^(much )?better$/i.test(text) ||
    /^feeling (much )?better$/i.test(text)
  ) {
    return "much_better";
  }
  if (
    /^slightly better$/i.test(text) ||
    /^a (little|bit) better$/i.test(text)
  ) {
    return "slightly_better";
  }

  // "Same" responses - must be clearly about status, not describing symptoms
  if (
    /^(the )?same$/i.test(text) ||
    /^no change$/i.test(text) ||
    /^unchanged$/i.test(text)
  ) {
    return "same_symptoms";
  }

  // "Worse" responses - must be short status updates, not symptom descriptions
  if (
    /^worse$/i.test(text) ||
    /^getting worse$/i.test(text) ||
    /^feeling worse$/i.test(text)
  ) {
    return "worse_condition";
  }

  // Emergency - only for clear emergency requests
  if (
    /^(call )?911$/i.test(text) ||
    /^emergency$/i.test(text) ||
    /^need help now$/i.test(text)
  ) {
    return "emergency_help";
  }

  // If none of the strict patterns match, it's NOT a poll response
  return null;
};

// Note: Risk level determination is now handled by MedGemma AI

// Function to handle poll responses from health checkups
const handlePollResponse = async (
  phoneNumber,
  userExists = false,
  pollResponse,
  originalMessage
) => {
  // Get or create patient data for AI analysis
  let patientData = null;
  try {
    patientData = await prisma.patient.findUnique({
      where: { phoneNumber: phoneNumber },
    });

    // If user doesn't exist, create a new patient record
    if (!patientData) {
      console.log(
        `🆕 Creating new patient record for ${phoneNumber} via poll response`
      );

      patientData = await prisma.patient.create({
        data: {
          phone: phoneNumber,
          firstName: "User", // Default name until they provide it
          zipcode: "00000", // Default zipcode
          age: 35, // Default age for moderate risk assessment
          preferredLanguage: "en",
          registrationComplete: false, // Mark as incomplete
          consentGiven: true,
          monitoringEnabled: true, // Enable monitoring since they're responding to health polls
        },
      });

      console.log(`✅ Created new patient record: ${patientData.id}`);
      userExists = true; // Update flag for rest of function

      // Send onboarding link for new users responding to health polls
      const onboardingUrl = process.env.BASE_URL
        ? `${process.env.BASE_URL}/onboarding.html`
        : `https://24a3ffeedf11.ngrok-free.app/onboarding.html`;

      await whatsappQueue.add("send-whatsapp", {
        to: phoneNumber,
        message: `🌡️ *Welcome to HeatCare!*\n\nI noticed you responded to a health message. To provide personalized care and monitoring, please complete your health profile:\n\n📋 *Complete Registration:*\n${onboardingUrl}\n\n⚠️ *Important*: This is not medical advice. For emergencies, call 911.\n\nLet me address your current health concern first...`,
      });

      console.log(
        `📱 Sent onboarding link to new poll responder: ${phoneNumber}`
      );

      // Don't schedule checkups until they complete registration
    }
  } catch (error) {
    console.error("Error with patient data:", error);
    // Create minimal patient data for AI analysis if database fails
    patientData = {
      phone: phoneNumber,
      firstName: "User",
      age: 35,
      zipcode: "00000",
      preferredLanguage: "en",
    };
  }

  // Direct MedGemma analysis for conversational responses
  let aiAnalysis = null;

  if (patientData && originalMessage) {
    try {
      console.log(
        `💬 [Poll] Sending raw poll context to MedGemma with guard rails: "${originalMessage}"`
      );

      const weatherData = {
        feelsLike: 95 + (parseInt(patientData.zipcode || "00000") % 10), // Simple temp estimation
        humidity: 65,
        heatWarning: false, // Let MedGemma determine urgency from conversation
      };

      console.log(
        `🤖 [Poll] Running MedGemma-only analysis for poll response...`
      );
      aiAnalysis = await analyzeSymptoms(
        originalMessage,
        patientData,
        weatherData
      );

      // Guard rail: Validate MedGemma response for poll handling
      if (!aiAnalysis || (!aiAnalysis.smsMessage && !aiAnalysis.advice)) {
        throw new Error("MedGemma returned invalid poll response");
      }

      // Log AI analysis to database
      await prisma.healthAnalysis.create({
        data: {
          patientId: patientData.id,
          userInput: originalMessage,
          riskLevel: aiAnalysis.risk.level.toUpperCase(),
          riskScore: aiAnalysis.risk.score,
          confidence: aiAnalysis.symptoms.confidence,
          symptomsDetected: JSON.stringify(aiAnalysis.symptoms.categories),
          reasoning: JSON.stringify([
            `Risk: ${aiAnalysis.risk.band}`,
            `Symptoms: ${aiAnalysis.symptoms.categories.join(", ")}`,
          ]),
          immediateActions: JSON.stringify([aiAnalysis.advice]),
          monitoringPattern: aiAnalysis.risk.level.toUpperCase(),
          monitoringIntervals: JSON.stringify([aiAnalysis.monitoringInterval]),
          monitoringDuration: aiAnalysis.monitoringInterval,
          responseMessage: aiAnalysis.advice,
          monitoringScheduled: true,
        },
      });

      console.log(`🧠 AI Analysis for ${phoneNumber}:`, {
        risk: aiAnalysis.risk.level,
        symptoms: aiAnalysis.symptoms.categories,
        emergency: aiAnalysis.recommendations.emergency,
      });
    } catch (error) {
      console.error("❌ AI Analysis error:", error);
    }
  }

  // Handle invalid poll responses
  const validResponses = [
    "much_better",
    "slightly_better",
    "same_symptoms",
    "worse_condition",
    "emergency_help",
  ];
  if (!validResponses.includes(pollResponse)) {
    await whatsappQueue.add("send-whatsapp", {
      to: phoneNumber,
      message:
        "❓ I didn't understand your response to the health poll.\n\n*Please try one of these:*\n✅ 'better' - Much better\n🟡 'slightly' - Slightly better\n⚪ 'same' - No change\n🟠 'worse' - Getting worse\n🚨 'emergency' - Need help now",
    });
    return;
  }

  // MedGemma-only response - no fallbacks
  if (!aiAnalysis || (!aiAnalysis.smsMessage && !aiAnalysis.advice)) {
    // If MedGemma failed, we should have thrown an error already
    // This is a guard rail - emergency detection for poll responses
    const isEmergency =
      pollResponse === "emergency_help" ||
      originalMessage.toLowerCase().includes("911");

    if (isEmergency) {
      finalMessage =
        "🚨 EMERGENCY: Call 911 immediately. This requires urgent medical care.";
    } else {
      // Let the error bubble up - no static fallbacks in MedGemma-only system
      throw new Error(
        "MedGemma analysis required for poll responses - no fallback available"
      );
    }
  } else {
    // MedGemma provides the intelligent response
    finalMessage = aiAnalysis.smsMessage || aiAnalysis.advice;
  }

  // Send the AI-generated response message
  await whatsappQueue.add("send-whatsapp", {
    to: phoneNumber,
    message: finalMessage,
  });

  // Determine monitoring action based on poll response and AI analysis
  let monitoringAction = "continue";

  // Use AI escalation level if available, otherwise determine from poll response
  if (aiAnalysis?.recommendations?.emergency || aiAnalysis?.emergencyAlert) {
    monitoringAction = "emergency";
  } else if (
    aiAnalysis?.recommendations?.escalate ||
    pollResponse === "worse_condition"
  ) {
    monitoringAction = "escalate";
  } else if (pollResponse === "much_better") {
    monitoringAction = "reduce";
  } else if (pollResponse === "emergency_help") {
    monitoringAction = "emergency";
  }

  // Execute monitoring actions
  switch (monitoringAction) {
    case "reduce":
      await cancelHealthCheckups(phoneNumber, "symptom"); // Cancel symptom monitoring, keep daily
      console.log(
        `[Health Monitor] ${phoneNumber} - Reduced monitoring (feeling better)`
      );
      break;

    case "escalate":
      // Use AI-determined escalation level or default to urgent
      const escalationLevel =
        aiAnalysis?.escalationLevel ||
        (aiAnalysis?.risk?.level === "high" ? "urgent" : "urgent");

      await updateMonitoringFrequency(phoneNumber, escalationLevel, "symptom");
      console.log(
        `[Health Monitor] ${phoneNumber} - Escalated to ${escalationLevel} monitoring`
      );
      break;

    case "emergency":
      await cancelHealthCheckups(phoneNumber, "symptom"); // Clear symptom monitoring

      // Schedule emergency follow-up
      await whatsappQueue.add(
        "send-whatsapp",
        {
          to: phoneNumber,
          message:
            "🚨 *Emergency Follow-up in 5 minutes*\nDid you call 911? Reply: 'called' / 'need help' / 'resolved'",
        },
        { delay: 5 * 60 * 1000 }
      );

      console.log(
        `[Health Monitor] ${phoneNumber} - Emergency protocol activated`
      );
      break;

    case "continue":
    default:
      console.log(
        `[Health Monitor] ${phoneNumber} - Continuing current monitoring`
      );
      break;
  }

  // Log the poll response to database
  await prisma.message.create({
    data: {
      from: `whatsapp:${phoneNumber}`,
      to: whatsappConfig.sandboxNumber,
      body: `Poll response: ${pollResponse} - Original: "${originalMessage}"`,
      direction: "incoming",
      messageType: "whatsapp",
    },
  });
};

// Serve static files from public directory
app.use(express.static("public"));

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Storm Logic WhatsApp API with BullMQ",
    status: "running",
    whatsappSandbox: whatsappConfig.sandboxNumber,
    routes: {
      registration: "/onboarding.html",
      success: "/success",
      weatherDemo: "/weather-demo",
      weatherSuccess: "/weather-success",
      health: "/health",
    },
    timestamp: new Date().toISOString(),
  });
});

// Weather alert demo page route
app.get("/weather-demo", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Weather Alert Demo - HeatCare</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #ff7b7b 0%, #667eea 100%);
            min-height: 100vh;
            padding: 20px;
            color: #333;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #ff7b7b 0%, #ff9a9e 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }

        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }

        .header p {
            font-size: 1.1rem;
            opacity: 0.9;
        }

        .content {
            padding: 40px;
        }

        .demo-section {
            margin-bottom: 30px;
            padding: 25px;
            border: 2px solid #f0f0f0;
            border-radius: 12px;
            background: #fafafa;
        }

        .demo-section h3 {
            color: #333;
            margin-bottom: 15px;
            font-size: 1.3rem;
        }

        .temp-buttons {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }

        .temp-button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 15px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: all 0.3s ease;
            text-decoration: none;
            text-align: center;
            display: inline-block;
        }

        .temp-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
        }

        .temp-button.hot {
            background: linear-gradient(135deg, #ff7b7b 0%, #ff9a9e 100%);
        }

        .temp-button.extreme {
            background: linear-gradient(135deg, #ff4757 0%, #ff3838 100%);
        }

        .info-box {
            background: #e8f4f8;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin: 20px 0;
            border-radius: 8px;
        }

        .patient-info {
            background: #f0f8f0;
            border: 2px solid #4caf50;
            padding: 20px;
            border-radius: 12px;
            margin: 20px 0;
        }

        .patient-info h4 {
            color: #2e7d32;
            margin-bottom: 10px;
        }

        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 14px;
        }

        .loading {
            display: none;
            text-align: center;
            padding: 20px;
        }

        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .status {
            margin: 20px 0;
            padding: 15px;
            border-radius: 8px;
            font-weight: 500;
        }

        .status.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }

        .status.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🌡️ Weather Alert Demo</h1>
            <p>Test weather alerts for high-risk patients with medications</p>
        </div>

        <div class="content">
            <div class="patient-info">
                <h4>📱 Demo Patient Profile:</h4>
                <p><strong>Name:</strong> Muhammad (Age 72)</p>
                <p><strong>Phone:</strong> +923311384208</p>
                <p><strong>Location:</strong> Phoenix, AZ (85001)</p>
                <p><strong>Medications:</strong> Lisinopril, Metformin, Furosemide (heat-sensitive)</p>
                <p><strong>Conditions:</strong> Diabetes, Heart Disease</p>
            </div>

            <div class="demo-section">
                <h3>🌡️ Test Different Temperature Scenarios</h3>
                <p>Click any button to send a weather alert to WhatsApp with that temperature:</p>
                
                <div class="temp-buttons">
                    <button class="temp-button" onclick="sendWeatherAlert(75)">75°F<br><small>Comfortable</small></button>
                    <button class="temp-button" onclick="sendWeatherAlert(85)">85°F<br><small>Warm</small></button>
                    <button class="temp-button" onclick="sendWeatherAlert(95)">95°F<br><small>Hot</small></button>
                    <button class="temp-button hot" onclick="sendWeatherAlert(100)">100°F<br><small>Dangerous</small></button>
                    <button class="temp-button extreme" onclick="sendWeatherAlert(105)">105°F<br><small>Emergency</small></button>
                    <button class="temp-button extreme" onclick="sendWeatherAlert(110)">110°F<br><small>Extreme</small></button>
                </div>
            </div>

            <div class="info-box">
                <h4>💡 What You'll Receive:</h4>
                <ul>
                    <li><strong>75-85°F:</strong> Routine weather updates</li>
                    <li><strong>95°F:</strong> Heat advisory with precautions</li>
                    <li><strong>100°F:</strong> Dangerous heat warning with medication alerts</li>
                    <li><strong>105°F+:</strong> Emergency heat alerts with immediate action needed</li>
                </ul>
            </div>

            <div id="loading" class="loading">
                <div class="spinner"></div>
                <p>Sending weather alert...</p>
            </div>

            <div id="status"></div>
        </div>

        <div class="footer">
            <p>Weather alerts will be sent to your WhatsApp at +923311384208</p>
            <p>Make sure you're connected to the Twilio WhatsApp sandbox</p>
        </div>
    </div>

    <script>
        async function sendWeatherAlert(temperature) {
            const loading = document.getElementById('loading');
            const status = document.getElementById('status');
            
            loading.style.display = 'block';
            status.innerHTML = '';

            try {
                const response = await fetch('/api/send-weather-alert', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        temperature: temperature,
                        phoneNumber: '+923311384208'
                    })
                });

                const result = await response.json();
                
                loading.style.display = 'none';

                if (response.ok) {
                    status.innerHTML = \`
                        <div class="status success">
                            <h4>✅ Weather Alert Sent Successfully!</h4>
                            <p><strong>Temperature:</strong> \${temperature}°F</p>
                            <p><strong>Alert Message:</strong> "\${result.alert.message}"</p>
                            <p><strong>Urgency:</strong> \${result.alert.urgency.toUpperCase()}</p>
                            <p><strong>Message ID:</strong> \${result.message.sid}</p>
                            <p>📱 Check your WhatsApp for the alert!</p>
                        </div>
                    \`;
                } else {
                    throw new Error(result.error || 'Failed to send alert');
                }
            } catch (error) {
                loading.style.display = 'none';
                status.innerHTML = \`
                    <div class="status error">
                        <h4>❌ Error Sending Alert</h4>
                        <p>\${error.message}</p>
                        <p>Please check your WhatsApp connection and try again.</p>
                    </div>
                \`;
            }
        }
    </script>
</body>
</html>
  `);
});

// Registration success page route
app.get("/success", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Registration Complete - HeatCare</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #4caf50 0%, #667eea 100%);
            min-height: 100vh;
            padding: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            max-width: 600px;
            width: 100%;
            padding: 40px;
            text-align: center;
        }
        .success-icon { font-size: 4rem; margin-bottom: 20px; }
        h1 { color: #333; font-size: 2.5rem; margin-bottom: 16px; }
        .subtitle { color: #666; font-size: 1.1rem; line-height: 1.6; margin-bottom: 30px; }
        .info-box {
            background: #f8f9ff;
            border-left: 4px solid #4caf50;
            padding: 20px;
            margin: 20px 0;
            text-align: left;
            border-radius: 8px;
        }
        .info-box h3 { color: #2e7d32; margin-bottom: 12px; text-align: center; }
        .info-box ul { color: #555; padding-left: 20px; }
        .info-box li { margin-bottom: 8px; }
        .whatsapp-info {
            background: #e8f5e8;
            border: 2px solid #4caf50;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
        }
        .whatsapp-number { font-size: 1.5rem; font-weight: bold; color: #2e7d32; margin: 10px 0; }
        .button {
            background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin: 10px;
            transition: transform 0.2s ease;
        }
        .button:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(76, 175, 80, 0.3); }
        .button.secondary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">✅</div>
        <h1>Registration Complete!</h1>
        <p class="subtitle">Welcome to HeatCare! Your personalized health monitoring is now active.</p>

        <div class="whatsapp-info">
            <h3>📱 WhatsApp Integration</h3>
            <p>You'll receive health alerts and check-ins on WhatsApp at:</p>
            <div class="whatsapp-number">+14155238886</div>
            <p><small>This is the Twilio Sandbox number for development</small></p>
        </div>

        <div class="info-box">
            <h3>💬 How to Interact:</h3>
            <ul>
                <li><strong>Health Updates:</strong> Send messages like "I have a headache" or "I'm feeling fine"</li>
                <li><strong>Location Updates:</strong> Text "Update zip 90210" to change your location</li>
                <li><strong>Emergency Help:</strong> Text "911" for immediate assistance</li>
                <li><strong>Opt Out:</strong> Text "STOP" to disable alerts anytime</li>
                <li><strong>Help:</strong> Text "help" for available commands</li>
            </ul>
        </div>

        <div class="info-box">
            <h3>🔒 Privacy & Safety:</h3>
            <ul>
                <li>Your health data is securely stored and encrypted</li>
                <li>We only use your information for health monitoring</li>
                <li>You can update or delete your data anytime</li>
                <li>This service supplements but doesn't replace medical care</li>
            </ul>
        </div>

        <div class="actions">
            <a href="/weather-demo" class="button">🌡️ Test Weather Alerts</a>
            <a href="/" class="button secondary">← Back to Dashboard</a>
        </div>
    </div>
</body>
</html>
  `);
});

// Success page route for weather alerts
app.get("/weather-success", (req, res) => {
  const { temperature, urgency, message } = req.query;

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Weather Alert Sent Successfully - HeatCare</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #4caf50 0%, #667eea 100%);
            min-height: 100vh;
            padding: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            max-width: 600px;
            width: 100%;
            padding: 40px;
            text-align: center;
        }

        .success-icon {
            font-size: 4rem;
            margin-bottom: 20px;
            animation: bounce 2s infinite;
        }

        @keyframes bounce {
            0%, 20%, 50%, 80%, 100% {
                transform: translateY(0);
            }
            40% {
                transform: translateY(-10px);
            }
            60% {
                transform: translateY(-5px);
            }
        }

        h1 {
            color: #333;
            font-size: 2.5rem;
            margin-bottom: 16px;
        }

        .subtitle {
            color: #666;
            font-size: 1.1rem;
            line-height: 1.6;
            margin-bottom: 30px;
        }

        .alert-details {
            background: #f8f9ff;
            border: 2px solid #4caf50;
            border-radius: 12px;
            padding: 25px;
            margin: 25px 0;
            text-align: left;
        }

        .alert-details h3 {
            color: #2e7d32;
            margin-bottom: 15px;
            text-align: center;
        }

        .detail-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid #e0e0e0;
        }

        .detail-row:last-child {
            border-bottom: none;
        }

        .detail-label {
            font-weight: 600;
            color: #333;
        }

        .detail-value {
            color: #555;
            text-align: right;
            max-width: 60%;
        }

        .alert-message {
            background: #e8f5e8;
            border-left: 4px solid #4caf50;
            padding: 20px;
            margin: 20px 0;
            border-radius: 8px;
            font-style: italic;
            color: #2e7d32;
        }

        .urgency-badge {
            display: inline-block;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
        }

        .urgency-routine {
            background: #e3f2fd;
            color: #1976d2;
        }

        .urgency-urgent {
            background: #fff3e0;
            color: #f57c00;
        }

        .urgency-emergency {
            background: #ffebee;
            color: #d32f2f;
        }

        .actions {
            margin-top: 30px;
        }

        .button {
            background: linear-gradient(135deg, #4caf50 0%, #45a049 100%);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin: 10px;
            transition: transform 0.2s ease;
        }

        .button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(76, 175, 80, 0.3);
        }

        .button.secondary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .whatsapp-info {
            background: #e8f5e8;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            color: #2e7d32;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">📱✅</div>
        <h1>Weather Alert Sent!</h1>
        <p class="subtitle">Your weather alert has been successfully delivered via WhatsApp.</p>

        <div class="alert-details">
            <h3>📊 Alert Details</h3>
            <div class="detail-row">
                <span class="detail-label">🌡️ Temperature:</span>
                <span class="detail-value">${temperature || "N/A"}°F</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">🚨 Urgency Level:</span>
                <span class="detail-value">
                    <span class="urgency-badge urgency-${
                      urgency || "routine"
                    }">${urgency || "routine"}</span>
                </span>
            </div>
            <div class="detail-row">
                <span class="detail-label">📱 Sent To:</span>
                <span class="detail-value">+923311384208</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">⏰ Timestamp:</span>
                <span class="detail-value">${new Date().toLocaleString()}</span>
            </div>
        </div>

        ${
          message
            ? `
        <div class="alert-message">
            <strong>📝 Alert Message:</strong><br>
            "${message}"
        </div>
        `
            : ""
        }

        <div class="whatsapp-info">
            <strong>📱 WhatsApp Delivery:</strong><br>
            Check your WhatsApp messages for the weather alert. The message was sent to your registered phone number.
        </div>

        <div class="actions">
            <a href="/weather-demo" class="button">🌡️ Send Another Alert</a>
            <a href="/" class="button secondary">← Back to Dashboard</a>
        </div>
    </div>
</body>
</html>
  `);
});

// Twilio message status webhook: receive delivery status updates
app.post("/twilio/status-webhook", async (req, res) => {
  const { MessageSid, MessageStatus, ErrorCode, ErrorMessage, From, To, Body } =
    req.body;

  console.log(`[Status Webhook] Message ${MessageSid}: ${MessageStatus}`);

  try {
    // Find the message in our database
    const existingMessage = await prisma.message.findFirst({
      where: { messageSid: MessageSid },
    });

    if (existingMessage) {
      // Update the message status
      await prisma.message.update({
        where: { id: existingMessage.id },
        data: {
          status: MessageStatus,
          errorMessage: ErrorCode ? `${ErrorCode}: ${ErrorMessage}` : null,
        },
      });

      console.log(
        `[Status Webhook] Updated message ${MessageSid} status to: ${MessageStatus}`
      );

      // Handle failed messages for retry logic (optional)
      if (MessageStatus === "failed" || MessageStatus === "undelivered") {
        console.warn(
          `[Status Webhook] Message failed: ${MessageSid} - ${ErrorCode}: ${ErrorMessage}`
        );

        // You could implement retry logic here
        // Or alert admins about delivery failures
      }

      // Handle successful delivery
      if (MessageStatus === "delivered") {
        console.log(
          `[Status Webhook] Message successfully delivered: ${MessageSid}`
        );
      }
    } else {
      console.warn(
        `[Status Webhook] Message not found in database: ${MessageSid}`
      );
    }

    // Always respond with 200 OK to acknowledge receipt
    res.status(200).send("OK");
  } catch (error) {
    console.error(`[Status Webhook] Error processing status update:`, error);
    res.status(500).send("Error processing status update");
  }
});

// Update patient risk data after each analysis
async function updatePatientRiskData(
  phoneNumber,
  aiAnalysis,
  symptomText,
  weatherData
) {
  try {
    const riskData = {
      lastRiskLevel: aiAnalysis.riskLevel || "unknown",
      lastUrgency: aiAnalysis.urgency || "routine",
      lastEscalationLevel: aiAnalysis.escalationLevel || "none",
      lastMonitoringInterval: aiAnalysis.monitoringInterval || 1440, // minutes
      lastSymptomText: symptomText,
      lastAnalysisTimestamp: new Date(),
      lastWeatherTemp: weatherData.feelsLike || null,
      lastWeatherHumidity: weatherData.humidity || null,
      confidenceScore: aiAnalysis.confidence || 0.8,
      emergencyAlerted: aiAnalysis.emergencyAlert || false,
    };

    await prisma.patient.update({
      where: { phoneNumber: phoneNumber },
      data: riskData,
    });

    console.log(
      `📊 Updated risk data for ${phoneNumber}: Risk=${riskData.lastRiskLevel}, Urgency=${riskData.lastUrgency}`
    );

    // Also log to HealthAnalysis table for history tracking
    await prisma.healthAnalysis.create({
      data: {
        patientId: (
          await prisma.patient.findUnique({
            where: { phoneNumber: phoneNumber },
            select: { id: true },
          })
        ).id,
        symptoms: symptomText,
        riskLevel: aiAnalysis.riskLevel || "unknown",
        urgency: aiAnalysis.urgency || "routine",
        aiResponse: aiAnalysis.smsMessage || aiAnalysis.advice || "",
        weatherContext: JSON.stringify(weatherData),
        escalationLevel: aiAnalysis.escalationLevel || "none",
        monitoringInterval: aiAnalysis.monitoringInterval || 1440,
        confidence: aiAnalysis.confidence || 0.8,
        emergencyAlert: aiAnalysis.emergencyAlert || false,
        analysisMethod: "hybrid_ai", // Gemini + HeatCare
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error(
      `❌ Failed to update risk data for ${phoneNumber}:`,
      error.message
    );
    // Don't throw - this shouldn't break the main flow
  }
}

// Twilio WhatsApp webhook: receive WhatsApp messages
app.post("/twilio/whatsapp-webhook", async (req, res) => {
  const { From, Body, MediaUrl0, MediaContentType0, NumMedia } = req.body;

  console.log(`[WhatsApp Webhook] From: ${From}, Body: ${Body}`);

  try {
    // Save incoming message to database
    await prisma.message.create({
      data: {
        from: From,
        to: whatsappConfig.from,
        body: Body || "",
        direction: "incoming",
        messageType: "whatsapp",
        mediaUrl: MediaUrl0 || null,
        mediaType: MediaContentType0 || null,
        numMedia: parseInt(NumMedia) || 0,
      },
    });

    // Extract phone number from WhatsApp format (whatsapp:+1234567890)
    const phoneNumber = whatsappConfig.extractPhoneNumber(From);

    // Registration flow - get or create user
    let user = await prisma.patient.findUnique({
      where: { phoneNumber: phoneNumber },
    });

    const isNewUser = !user;
    if (!user) {
      const firstName = Body ? Body.split(" ")[0] : "User";
      user = await prisma.patient.create({
        data: {
          phoneNumber: phoneNumber,
          firstName,
          zipcode: "00000",
          age: 0,
          isPregnant: false,
          smoker: false,
        },
      });
    }

    // Check for various registration/update patterns
    const nameZipAgePattern = /^([A-Za-z\-\'\s]{2,}),\s*(\d{5}),\s*(\d{1,3})$/;
    const registrationMatch = Body?.match(nameZipAgePattern);

    // Check for zipcode-only updates (for existing users)
    const zipcodeUpdatePattern =
      /^(?:update|change|new)\s*(?:zip|zipcode|location)?\s*(?:to|is)?\s*(\d{5})$/i;
    const zipcodeMatch = Body?.match(zipcodeUpdatePattern);

    // Check for simple zipcode patterns (just the number)
    const simpleZipcodePattern = /^(\d{5})$/;
    const simpleZipcodeMatch = Body?.match(simpleZipcodePattern);

    if (registrationMatch && (user.zipcode === "00000" || user.age === 0)) {
      const [, fullName, zipcode, ageStr] = registrationMatch;
      const age = parseInt(ageStr);

      if (age >= 1 && age <= 120) {
        // Update user with complete registration
        await prisma.patient.update({
          where: { phoneNumber: phoneNumber },
          data: {
            firstName: fullName.trim(),
            zipcode: zipcode,
            age: age,
          },
        });

        await whatsappQueue.add("send-whatsapp", {
          to: phoneNumber,
          message: `✅ *Registration Complete!*\n\nThanks ${fullName}! I've updated your profile:\n📍 ZIP: ${zipcode}\n🎂 Age: ${age}\n\nYou'll now receive personalized health monitoring based on your location and age. I've also enrolled you in daily checkups at 9:00 AM.\n\nReply 'help' for commands or just tell me how you're feeling anytime!`,
        });

        console.log(
          `✅ Completed registration for ${phoneNumber}: ${fullName}, ${zipcode}, ${age}`
        );
        return;
      } else {
        await whatsappQueue.add("send-whatsapp", {
          to: phoneNumber,
          message: `❌ Age must be between 1 and 120. Please try again:\n\nExample: "John Smith, 10001, 45"`,
        });
        return;
      }
    }

    // Handle zipcode updates for existing users
    if (zipcodeMatch && user.zipcode !== "00000" && user.age > 0) {
      const newZipcode = zipcodeMatch[1];

      await prisma.patient.update({
        where: { phoneNumber: phoneNumber },
        data: { zipcode: newZipcode },
      });

      await whatsappQueue.add("send-whatsapp", {
        to: phoneNumber,
        message: `✅ *Location Updated!*\n\n📍 Your ZIP code has been updated to: ${newZipcode}\n\nI'll now provide weather alerts and health monitoring based on your new location. Stay safe! 🌡️`,
      });

      console.log(`✅ Updated zipcode for ${phoneNumber}: ${newZipcode}`);
      return;
    }

    // Handle simple zipcode updates (just numbers) for incomplete registrations
    if (
      simpleZipcodeMatch &&
      (user.zipcode === "00000" || user.age === 0) &&
      user.firstName !== "User"
    ) {
      const newZipcode = simpleZipcodeMatch[1];

      await prisma.patient.update({
        where: { phoneNumber: phoneNumber },
        data: { zipcode: newZipcode },
      });

      await whatsappQueue.add("send-whatsapp", {
        to: phoneNumber,
        message: `✅ *ZIP Code Saved!*\n\n📍 Location: ${newZipcode}\n\nNow please tell me your age to complete registration:\nExample: "25" or "${user.firstName}, ${newZipcode}, 25"`,
      });

      console.log(
        `✅ Updated zipcode for incomplete registration ${phoneNumber}: ${newZipcode}`
      );
      return;
    }

    // Send onboarding link to brand new users
    if (isNewUser) {
      const onboardingUrl = process.env.BASE_URL
        ? `${process.env.BASE_URL}/onboarding.html`
        : `https://24a3ffeedf11.ngrok-free.app/onboarding.html`;

      await whatsappQueue.add("send-whatsapp", {
        to: phoneNumber,
        message: `🌡️ *Welcome to HeatCare!*\n\nI'm your personal heat health assistant. To get started with personalized alerts and monitoring, please complete your health profile:\n\n📋 *Complete Registration:*\n${onboardingUrl}\n\n⚠️ *Important*: This is not medical advice. For emergencies, call 911.\n\n💬 After registration, I'll provide personalized health tips based on your profile and local weather conditions.`,
      });

      console.log(`📱 Sent onboarding link to new user: ${phoneNumber}`);

      // Don't schedule checkups until they complete registration
    }

    // Process message content for health symptoms
    if (Body) {
      const messageText = Body.toLowerCase();

      // Check for poll responses (numbers, keywords, or button IDs)
      const pollResponse = detectPollResponse(messageText);
      if (pollResponse) {
        await handlePollResponse(phoneNumber, pollResponse, messageText);
        return;
      }

      // Check for health-related symptoms using AI analysis
      const healthSymptoms = [
        "dizzy",
        "dizziness",
        "headache",
        "nausea",
        "vomiting",
        "chest pain",
        "difficulty breathing",
        "confused",
        "weak",
        "faint",
        "tired",
        "hot",
        "fever",
        "sick",
        "pain",
        "hurt",
        "sweating",
        "thirsty",
      ];

      const hasHealthSymptoms = healthSymptoms.some((symptom) =>
        messageText.includes(symptom)
      );

      if (hasHealthSymptoms) {
        // Direct MedGemma analysis - no NLP preprocessing needed
        console.log(
          `💬 [Health] Sending raw message directly to MedGemma: "${Body}"`
        );

        try {
          const weatherData = {
            feelsLike: 95 + (parseInt(user.zipcode || "00000") % 10), // Simple temp estimation
            humidity: 65,
            heatWarning: false, // Let MedGemma determine urgency from raw text
          };

          console.log(
            `🤖 [Health] Running MedGemma-only analysis with guard rails...`
          );
          const aiAnalysis = await analyzeSymptoms(Body, user, weatherData);

          // Guard rail: Ensure we have a valid response
          if (!aiAnalysis.smsMessage && !aiAnalysis.advice) {
            throw new Error("MedGemma returned empty response");
          }

          // Update patient's risk calculation in database
          await updatePatientRiskData(
            phoneNumber,
            aiAnalysis,
            Body,
            weatherData
          );

          // Send AI-generated response
          const responseMessage = aiAnalysis.smsMessage || aiAnalysis.advice;

          await whatsappQueue.add("send-whatsapp", {
            to: phoneNumber,
            message: responseMessage,
          });

          // Schedule symptom-based monitoring using AI-determined escalation
          const escalationLevel =
            aiAnalysis.escalationLevel ||
            (aiAnalysis.emergencyAlert ? "emergency" : "medium");

          await scheduleHealthCheckup(
            phoneNumber,
            Body,
            escalationLevel,
            "symptom"
          );

          console.log(
            `[Health Monitor] MedGemma analysis for ${phoneNumber}:`,
            {
              risk: aiAnalysis.risk?.level,
              escalation: escalationLevel,
              urgency: aiAnalysis.urgency,
              guardRailsActive: true,
            }
          );
        } catch (error) {
          console.error("❌ MedGemma service unavailable:", error);

          // Guard rail: Emergency safety message when MedGemma fails
          const emergencyKeywords = [
            "911",
            "emergency",
            "chest pain",
            "can't breathe",
            "fainting",
          ];
          const isEmergency = emergencyKeywords.some((keyword) =>
            Body.toLowerCase().includes(keyword)
          );

          if (isEmergency) {
            await whatsappQueue.add("send-whatsapp", {
              to: phoneNumber,
              message:
                "🚨 EMERGENCY DETECTED: Call 911 immediately if you're having chest pain, trouble breathing, or fainting. Get medical help now!",
            });
          } else {
            await whatsappQueue.add("send-whatsapp", {
              to: phoneNumber,
              message:
                "⚠️ Health service temporarily unavailable. If this is urgent, call 911. For non-urgent symptoms, please try again in a few minutes.",
            });
          }

          // No fallback processing - system requires MedGemma to function

          // Schedule basic monitoring
          await scheduleHealthCheckup(phoneNumber, Body, "medium", "symptom");
        }

        // Alert family/emergency contact if configured
        // This could be implemented based on user preferences
      } else if (messageText.includes("help") || messageText.includes("info")) {
        // Help/info response
        await whatsappQueue.add("send-whatsapp", {
          to: phoneNumber,
          message:
            "🌡️ *Climate Health Alerts Help* 📱\n\nAvailable commands:\n• Send symptoms for health guidance\n• 'status' - Check your health status\n• 'stop' - Pause all alerts\n• 'stop daily' - Disable daily checkups\n• 'start' - Resume alerts\n• 'start daily' - Enable daily checkups\n\n🆘 Emergency: Call 911\n💡 Tips: Stay hydrated, seek shade, avoid heavy activity during heat waves.",
        });
      } else if (messageText.includes("stop daily")) {
        // Stop daily checkups only
        await cancelHealthCheckups(phoneNumber, "daily");

        await whatsappQueue.add("send-whatsapp", {
          to: phoneNumber,
          message:
            "⏸️ Daily checkups disabled.\n\n💡 You'll still receive symptom-based monitoring if needed.\n\nSend 'start daily' to re-enable daily checkups.",
        });
      } else if (messageText.includes("start daily")) {
        // Resume daily checkups
        await scheduleDailyCheckup(phoneNumber);

        await whatsappQueue.add("send-whatsapp", {
          to: phoneNumber,
          message:
            "✅ Daily checkups enabled!\n\n🌅 You'll receive a daily health check at 9:00 AM.\n\nThis is separate from any symptom monitoring.",
        });
      } else if (messageText.includes("stop")) {
        // Pause all alerts
        await prisma.patient.update({
          where: { phoneNumber: phoneNumber },
          data: { monitoringEnabled: false },
        });

        await cancelHealthCheckups(phoneNumber, "all");

        await whatsappQueue.add("send-whatsapp", {
          to: phoneNumber,
          message:
            "⏸️ All health alerts paused.\n\nSend 'start' to resume alerts anytime.\n\n⚠️ Remember: This doesn't affect emergency services. Call 911 for emergencies.",
        });
      } else if (messageText.includes("start")) {
        // Resume alerts
        await prisma.patient.update({
          where: { phoneNumber: phoneNumber },
          data: { monitoringEnabled: true },
        });

        await scheduleDailyCheckup(phoneNumber);

        await whatsappQueue.add("send-whatsapp", {
          to: phoneNumber,
          message:
            "✅ Health alerts resumed!\n\n🌅 Daily checkups enabled at 9:00 AM\n💡 Symptom monitoring will activate as needed\n\nStay safe! 🌡️💙",
        });
      } else {
        // General response - MedGemma-only with guard rails
        try {
          console.log(
            `💬 [General] Sending raw message to MedGemma with guard rails: "${Body}"`
          );

          const weatherData = {
            feelsLike: 95 + (parseInt(user.zipcode || "00000") % 10),
            humidity: 65,
            heatWarning: false, // Let MedGemma determine context from conversation
          };

          console.log(`🤖 [General] Running MedGemma-only analysis...`);
          const aiAnalysis = await analyzeSymptoms(Body, user, weatherData);

          // Guard rail: Ensure valid response
          if (!aiAnalysis.smsMessage && !aiAnalysis.advice) {
            throw new Error("MedGemma returned empty response");
          }

          const responseMessage = aiAnalysis.smsMessage || aiAnalysis.advice;

          await whatsappQueue.add("send-whatsapp", {
            to: phoneNumber,
            message: responseMessage,
          });
        } catch (error) {
          console.error("❌ [General] MedGemma service unavailable:", error);

          // Guard rail: Minimal safe response when MedGemma fails
          await whatsappQueue.add("send-whatsapp", {
            to: phoneNumber,
            message:
              "⚠️ Service temporarily unavailable. For health emergencies, call 911. Please try again in a few minutes.",
          });
        }
      }
    }

    // Send TwiML response
    res.set("Content-Type", "text/xml");
    res.send("<Response></Response>");
  } catch (error) {
    console.error("[WhatsApp Webhook Error]:", error);
    res.status(500).send("<Response></Response>");
  }
});

// Manual WhatsApp send endpoint
app.post("/send-whatsapp", async (req, res) => {
  try {
    const { to, message, mediaUrl, delay = 0 } = req.body;

    if (!to || !message) {
      return res.status(400).json({
        error: "Missing required fields: to, message",
      });
    }

    // Add job to WhatsApp queue
    const job = await whatsappQueue.add(
      "send-whatsapp",
      {
        to,
        message,
        mediaUrl,
      },
      {
        delay: parseInt(delay),
      }
    );

    res.json({
      status: "queued",
      jobId: job.id,
      to,
      message,
      delay,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Send WhatsApp Error]:", error);
    res.status(500).json({
      error: "Failed to queue WhatsApp message",
      details: error.message,
    });
  }
});

// Manual health checkup scheduler (for testing)
app.post("/schedule-checkup", async (req, res) => {
  try {
    const { phoneNumber, symptom, intervals } = req.body;

    if (!phoneNumber || !symptom) {
      return res
        .status(400)
        .json({ error: "phoneNumber and symptom are required" });
    }

    const checkupIntervals = intervals || [1, 5, 15, 60]; // Default intervals in minutes

    await scheduleHealthCheckup(phoneNumber, symptom, checkupIntervals);

    res.json({
      status: "scheduled",
      phoneNumber,
      symptom,
      intervals: checkupIntervals,
      message: `Health checkups scheduled for ${phoneNumber} at ${checkupIntervals.join(
        ", "
      )} minute intervals`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Schedule Checkup Error]:", error);
    res.status(500).json({
      error: "Failed to schedule health checkup",
      details: error.message,
    });
  }
});

// Cancel health checkups
app.post("/cancel-checkups", async (req, res) => {
  try {
    const { phoneNumber, symptom } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: "phoneNumber is required" });
    }

    await cancelHealthCheckups(phoneNumber, symptom || "all");

    res.json({
      status: "cancelled",
      phoneNumber,
      symptom: symptom || "all symptoms",
      message: `Health checkups cancelled for ${phoneNumber}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cancel Checkups Error]:", error);
    res.status(500).json({
      error: "Failed to cancel health checkups",
      details: error.message,
    });
  }
});

// Broadcast message to all users
app.post("/broadcast", async (req, res) => {
  try {
    const { message, mediaUrl } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Get all active users
    const users = await prisma.patient.findMany({
      where: { monitoringEnabled: true },
      select: { phone: true, firstName: true },
    });

    let queuedJobs = 0;
    for (const user of users) {
      await whatsappQueue.add("send-whatsapp", {
        to: user.phone,
        message: `Hi ${user.firstName}! 📢\n\n${message}`,
        mediaUrl,
      });
      queuedJobs++;
    }

    res.json({
      status: "broadcast_queued",
      usersCount: users.length,
      queuedJobs,
      message,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Broadcast Error]:", error);
    res.status(500).json({
      error: "Failed to queue broadcast",
      details: error.message,
    });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "Storm Logic WhatsApp API",
    whatsappSandbox: whatsappConfig.sandboxNumber,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API endpoint to send weather alerts (for demo)
app.post("/api/send-weather-alert", async (req, res) => {
  try {
    const { temperature, phoneNumber } = req.body;

    if (!temperature || !phoneNumber) {
      return res.status(400).json({
        error: "Missing required fields: temperature and phoneNumber",
      });
    }

    // Import weather service
    const weatherService = require("./services/weatherService");
    const { getTwilioClient } = require("./services");

    // Create demo patient data
    const demoPatient = {
      firstName: "Muhammad",
      phoneNumber: phoneNumber,
      zipcode: "85001", // Phoenix, AZ
      age: 72,
      chronicConditions: ["diabetes", "heart_disease"],
      medications: ["lisinopril", "metformin", "furosemide"], // Heat-sensitive medications
    };

    // Mock the weather service for the specific temperature
    const originalGetCurrentWeather = weatherService.getCurrentWeather;
    const originalDetectHeatWave = weatherService.detectHeatWave;

    weatherService.getCurrentWeather = async function (zipCode) {
      return {
        zipCode: zipCode,
        temperature: temperature,
        feelsLike: temperature + 8,
        humidity: 45,
        description: temperature >= 105 ? "Extremely Hot" : "Very Hot",
        condition: "Clear",
        windSpeed: 8,
        city: "Phoenix",
        state: "AZ",
        alerts:
          temperature >= 105
            ? [
                {
                  event: "Excessive Heat Warning",
                  severity: "extreme",
                },
              ]
            : [],
        source: "demo",
      };
    };

    weatherService.detectHeatWave = async function (zipCode) {
      return {
        alertLevel:
          temperature >= 105
            ? "emergency"
            : temperature >= 100
            ? "warning"
            : temperature >= 95
            ? "watch"
            : "none",
        currentTemp: temperature,
        maxFeelsLike: temperature + 8,
        daysAffected: temperature >= 100 ? 2 : temperature >= 95 ? 1 : 0,
        city: "Phoenix",
        zipcode: zipCode,
        isHeatWave: temperature >= 95,
        description: `Heat conditions for ${temperature}°F`,
      };
    };

    try {
      // Generate the weather alert
      console.log(`🌡️ Generating weather alert for ${temperature}°F...`);
      const alert = await weatherService.generateAdvancedWeatherAlert(
        demoPatient.zipcode,
        demoPatient
      );

      // Send via WhatsApp
      console.log(`📤 Sending WhatsApp message to ${phoneNumber}...`);
      const twilio = getTwilioClient();

      const message = await twilio.messages.create({
        body: alert.message,
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to: `whatsapp:${phoneNumber}`,
      });

      console.log(`✅ Weather alert sent! Message SID: ${message.sid}`);

      // Log to database if possible
      try {
        await prisma.message.create({
          data: {
            from: "system",
            to: phoneNumber,
            body: alert.message,
            direction: "outgoing",
            messageType: "weather_alert_demo",
            messageSid: message.sid,
            status: message.status,
          },
        });
      } catch (dbError) {
        console.warn("Could not log to database:", dbError.message);
      }

      // Return success response
      res.json({
        success: true,
        alert: alert,
        message: {
          sid: message.sid,
          status: message.status,
        },
        temperature: temperature,
        timestamp: new Date().toISOString(),
      });
    } finally {
      // Restore original methods
      weatherService.getCurrentWeather = originalGetCurrentWeather;
      weatherService.detectHeatWave = originalDetectHeatWave;
    }
  } catch (error) {
    console.error("❌ Error sending weather alert:", error);
    res.status(500).json({
      error: "Failed to send weather alert",
      message: error.message,
      details: error.stack,
    });
  }
});

// Patient onboarding API endpoint
app.post("/api/onboarding", async (req, res) => {
  try {
    const {
      firstName,
      phoneNumber,
      zipcode,
      age,
      optOut,
      medications,
      conditions,
      smoker,
      isPregnant,
      activityLevel,
      dialysisSchedule,
    } = req.body;

    // Validate required fields
    if (!firstName || !phoneNumber || !zipcode || !age) {
      return res.status(400).json({
        error:
          "Missing required fields: firstName, phoneNumber, zipcode, and age are required",
      });
    }

    // Clean up phone number format
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    const formattedPhone = cleanPhone.startsWith("1")
      ? `+${cleanPhone}`
      : `+1${cleanPhone}`;

    // Check if patient already exists
    const existingPatient = await prisma.patient.findUnique({
      where: { phoneNumber: formattedPhone },
    });

    if (existingPatient) {
      // Update existing patient
      const updatedPatient = await prisma.patient.update({
        where: { phoneNumber: formattedPhone },
        data: {
          firstName,
          zipcode,
          age: parseInt(age),
          optOutCustomMessages: Boolean(optOut),
          medications: medications ? JSON.stringify(medications) : null,
          preExistingConditions: conditions ? JSON.stringify(conditions) : null,
          chronicConditions: conditions ? JSON.stringify(conditions) : null,
          smoker: Boolean(smoker),
          isPregnant: Boolean(isPregnant),
          activityLevel: activityLevel || "moderate",
          dialysisSchedule: dialysisSchedule || null,
          updatedAt: new Date(),
        },
      });

      console.log(
        `✅ Updated patient profile for ${formattedPhone}: ${firstName}`
      );

      return res.json({
        success: true,
        message: "Profile updated successfully",
        patient: { id: updatedPatient.id, firstName: updatedPatient.firstName },
      });
    } else {
      // Create new patient
      const newPatient = await prisma.patient.create({
        data: {
          firstName,
          phoneNumber: formattedPhone,
          zipcode,
          age: parseInt(age),
          optOutCustomMessages: Boolean(optOut),
          medications: medications ? JSON.stringify(medications) : null,
          preExistingConditions: conditions ? JSON.stringify(conditions) : null,
          chronicConditions: conditions ? JSON.stringify(conditions) : null,
          smoker: Boolean(smoker),
          isPregnant: Boolean(isPregnant),
          activityLevel: activityLevel || "moderate",
          dialysisSchedule: dialysisSchedule || null,
        },
      });

      console.log(`✅ Created new patient: ${formattedPhone} - ${firstName}`);

      // Schedule daily checkups for new patients
      if (!Boolean(optOut)) {
        try {
          await scheduleDailyCheckup(formattedPhone);
          console.log(
            `✅ Scheduled daily checkups for new patient: ${formattedPhone}`
          );
        } catch (error) {
          console.error(
            `❌ Failed to schedule checkups for ${formattedPhone}:`,
            error.message
          );
        }
      }

      return res.json({
        success: true,
        message: "Registration successful",
        patient: { id: newPatient.id, firstName: newPatient.firstName },
      });
    }
  } catch (error) {
    console.error("❌ Onboarding error:", error);
    res.status(500).json({
      error: "Registration failed",
      message: error.message,
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    details: err.message,
  });
});

const PORT = process.env.PORT || 3000;

// Initialize services and start server
const startServer = async () => {
  try {
    // Initialize all shared services
    await initializeServices();

    // Start the HTTP server
    app.listen(PORT, () => {
      console.log(`🚀 Storm Logic WhatsApp API running on port ${PORT}`);
      console.log(`📱 WhatsApp Sandbox: ${whatsappConfig.sandboxNumber}`);
      console.log("\n📋 Available endpoints:");
      console.log("  GET  /                         - API info");
      console.log("  GET  /health                   - Health check");
      console.log("  POST /twilio/whatsapp-webhook  - WhatsApp webhook");
      console.log("  POST /twilio/status-webhook    - Message status webhook");
      console.log("  POST /send-whatsapp            - Send WhatsApp message");
      console.log(
        "  POST /schedule-checkup         - Schedule health checkups"
      );
      console.log("  POST /cancel-checkups          - Cancel health checkups");
      console.log("\n🔗 Set your Twilio webhook URLs to:");
      console.log(
        `     WhatsApp: https://24a3ffeedf11.ngrok-free.app/twilio/whatsapp-webhook`
      );
      console.log(
        `     Status:   https://24a3ffeedf11.ngrok-free.app/twilio/status-webhook`
      );
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received");
  const { shutdownServices } = require("./services");
  await shutdownServices();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received");
  const { shutdownServices } = require("./services");
  await shutdownServices();
  process.exit(0);
});

// Start the server
startServer();
