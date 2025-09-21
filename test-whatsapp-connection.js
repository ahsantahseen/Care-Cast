// WhatsApp Sandbox Connection Helper
const { getTwilioClient } = require('./services');

async function testWhatsAppConnection() {
  console.log("📱 Testing WhatsApp Connection");
  console.log("==============================");
  
  const twilio = getTwilioClient();
  
  try {
    // Test 1: Check if we can send a message to the sandbox number itself
    console.log("🔍 Testing sandbox connection...");
    
    const testMessage = await twilio.messages.create({
      body: "Test message from HeatCare system",
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`, // Send to self
    });
    
    console.log("✅ Sandbox self-test successful!");
    console.log(`   Message SID: ${testMessage.sid}`);
    console.log(`   Status: ${testMessage.status}`);
    
  } catch (error) {
    console.error("❌ Sandbox test failed:", error.message);
    
    if (error.message.includes("not a valid WhatsApp endpoint")) {
      console.log("\n💡 SOLUTION:");
      console.log("1. Go to your Twilio Console: https://console.twilio.com/");
      console.log("2. Navigate to: Messaging > Try it out > Send a WhatsApp message");
      console.log("3. Find your sandbox code (usually starts with 'join')");
      console.log("4. Send this message to +14155238886 from your WhatsApp:");
      console.log("   'join <your-sandbox-code>'");
      console.log("\n📱 Your phone number: +923311384208");
      console.log("📱 Sandbox number: +14155238886");
    }
  }
  
  try {
    // Test 2: Try to send to your actual number
    console.log("\n🔍 Testing connection to your number...");
    
    const userMessage = await twilio.messages.create({
      body: "🌡️ HeatCare Test: If you receive this, WhatsApp is connected!",
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:+923311384208`,
    });
    
    console.log("✅ Message sent to your phone!");
    console.log(`   Message SID: ${userMessage.sid}`);
    console.log(`   Status: ${userMessage.status}`);
    console.log("📱 Check your WhatsApp for the test message!");
    
  } catch (error) {
    console.error("❌ Failed to send to your phone:", error.message);
    
    if (error.message.includes("not a valid WhatsApp endpoint")) {
      console.log("\n🚨 ACTION REQUIRED:");
      console.log("Your phone (+923311384208) is not connected to the WhatsApp sandbox.");
      console.log("\n📋 Steps to fix:");
      console.log("1. Open WhatsApp on your phone");
      console.log("2. Send a message to: +14155238886");
      console.log("3. Send: 'join <sandbox-code>' (get code from Twilio console)");
      console.log("4. Wait for confirmation message");
      console.log("5. Run this test again");
    }
  }
}

// Run the test
if (require.main === module) {
  testWhatsAppConnection();
}

module.exports = { testWhatsAppConnection };
