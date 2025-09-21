# Storm Logic - HeatCare Health Monitoring System

A comprehensive health monitoring system that provides personalized weather alerts, health check-ins, and emergency detection via WhatsApp integration.

## 🚀 Quick Start

### Prerequisites

- Node.js (v16+)
- Redis server
- PostgreSQL database
- Twilio account with WhatsApp API access
- Environment variables configured

### Installation

1. **Clone and install dependencies:**

```bash
git clone <repo link>
cd "Storm Logic"
npm install
```

2. **Set up environment variables:**
   Create a `.env` file with the following variables:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/storm_logic"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Twilio WhatsApp
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_SANDBOX_NUMBER=+14155238886
TWILIO_WHATSAPP_SANDBOX_CODE=your_sandbox_code

# Server
PORT=3000
BASE_URL=https://your-ngrok-url.ngrok-free.app

# AI Services (Optional)
OPENAI_API_KEY=your_openai_key
GOOGLE_AI_API_KEY=your_google_ai_key
```

3. **Set up the database:**

```bash
npx prisma generate
npx prisma db push
```

4. **Start Redis server:**

```bash
redis-server
```

## 🏗️ System Architecture

### Core Components

- **Express Server** (`index.js`) - Main API server and webhook handler
- **Queue System** (`queue.js`) - BullMQ-based job queue management
- **Worker Process** (`worker.js`) - Background job processors
- **Database** - PostgreSQL with Prisma ORM
- **Redis** - Queue storage and caching

### Queue Types

1. **WhatsApp Queue** (`whatsapp-queue`)

   - Handles outgoing WhatsApp messages
   - Retry logic with exponential backoff
   - Message delivery tracking

2. **Health Cron Queue** (`health-cron-queue`)
   - Scheduled health check-ins
   - Weather monitoring jobs
   - Recurring symptom monitoring

## 🚀 Running the System

### Development Mode

Start all components in separate terminals:

```bash
# Terminal 1: Start Redis
redis-server

# Terminal 2: Start main server
npm run dev
# or
bun run index.js

# Terminal 3: Start worker process
npm run worker
# or
bun run worker.js
```

### Production Mode

```bash
# Start server with PM2 (recommended)
pm2 start index.js --name "storm-logic-server"
pm2 start worker.js --name "storm-logic-worker"
pm2 save
pm2 startup
```

## 📱 API Endpoints

### Core Routes

- `GET /` - System status and available routes
- `GET /health` - Health check endpoint
- `POST /webhook/twilio` - Twilio webhook handler
- `POST /webhook/whatsapp` - WhatsApp message webhook

### Registration & Demo

- `GET /onboarding.html` - Patient registration form
- `GET /success` - Registration success page
- `GET /weather-demo` - Weather alert testing interface
- `GET /weather-success` - Weather demo success page

### API Endpoints

- `POST /api/send-weather-alert` - Send test weather alerts
- `POST /api/register-patient` - Register new patient
- `GET /api/patients` - List all patients
- `GET /api/messages` - Message history

## 🔧 Services

### Core Services

- **Weather Service** (`services/weatherService.js`)

  - Real-time weather data fetching
  - Heat wave detection
  - Personalized weather alerts

- **Patient Registration** (`services/patientRegistration.js`)

  - Patient onboarding
  - Data validation
  - Risk assessment

- **Monitoring Service** (`services/monitoring.js`)

  - Health status tracking
  - Symptom analysis
  - Emergency detection

- **HeatCare AI** (`services/heatcareAI.js`)
  - AI-powered health analysis
  - Risk level assessment
  - Personalized recommendations

### External Integrations

- **Twilio WhatsApp API** - Message delivery
- **National Weather Service** - Weather data
- **OpenAI/Google AI** - Health analysis (optional)

## 📊 Database Schema

### Key Models

- **Patient** - User profiles and health data
- **Message** - WhatsApp message history
- **HealthAnalysis** - AI health assessments
- **MonitoringJob** - Scheduled health checks

## 🔄 Queue Jobs

### WhatsApp Jobs

- `send-whatsapp` - Send WhatsApp message
- `send-media-whatsapp` - Send media message

### Health Monitoring Jobs

- `daily-health-checkup` - Daily routine check-ins
- `recurring-health-monitor` - Symptom-based monitoring
- `weather-alert-checkin` - Weather-triggered check-ins
- `weather-monitoring` - Periodic weather checks
- `heat-wave-monitoring` - Heat wave detection

## 🌡️ Weather Monitoring

### Features

- Real-time weather data from NWS API
- Heat wave detection and alerts
- Personalized recommendations based on:
  - Patient age and health conditions
  - Medications and chronic conditions
  - Current weather conditions

### Alert Types

- **Emergency** (105°F+) - Immediate indoor shelter
- **Warning** (100-104°F) - Limit outdoor activity
- **Caution** (95-99°F) - Stay hydrated and cool
- **Routine** (<95°F) - General comfort tips

## 🏥 Health Monitoring

### Monitoring Types

1. **Daily Check-ins** - Routine morning health status
2. **Symptom Monitoring** - AI-powered symptom tracking
3. **Weather Alerts** - Heat-related health warnings
4. **Emergency Detection** - Critical condition alerts

### Risk Levels

- **Emergency** - 1-minute intervals
- **Critical** - 2-minute intervals
- **High** - 5-minute intervals
- **Medium** - 15-minute intervals
- **Low** - 60-minute intervals

## 📱 WhatsApp Integration

### Setup

1. **Twilio Sandbox Configuration:**

   - Connect your phone to sandbox: `join <sandbox-code>`
   - Send messages to: `+14155238886`

2. **Webhook Configuration:**
   - Set webhook URL: `https://your-domain.com/webhook/twilio`
   - Enable message status callbacks

### Message Types

- **Health Check-ins** - Interactive health status polls
- **Weather Alerts** - Personalized weather warnings
- **Emergency Alerts** - Critical health notifications
- **Daily Reminders** - Routine health monitoring

## 🧪 Testing & Demo

### Demo Scripts

- `setup-whatsapp-demo.js` - Set up demo patient
- `send-whatsapp-demo.js` - Send test messages
- `test-whatsapp-connection.js` - Test Twilio connection
- `demo-weather-alert.js` - Test weather alerts

### Web Interface

- Visit `/weather-demo` for interactive testing
- Use `/onboarding.html` for patient registration
- Check `/success` for registration confirmation

## 🔧 Configuration

### Environment Variables

| Variable                         | Description                    | Required |
| -------------------------------- | ------------------------------ | -------- |
| `DATABASE_URL`                   | PostgreSQL connection string   | Yes      |
| `REDIS_HOST`                     | Redis server host              | Yes      |
| `TWILIO_ACCOUNT_SID`             | Twilio account SID             | Yes      |
| `TWILIO_AUTH_TOKEN`              | Twilio auth token              | Yes      |
| `TWILIO_WHATSAPP_SANDBOX_NUMBER` | WhatsApp sandbox number        | Yes      |
| `BASE_URL`                       | Public server URL for webhooks | Yes      |

### Queue Configuration

- **WhatsApp Queue**: 3 concurrent workers
- **Health Queue**: 3 concurrent workers
- **Retry Policy**: Exponential backoff
- **Job Retention**: 100 completed, 50 failed

## 📈 Monitoring & Logging

### Logs

- Worker job completion/failure
- Message delivery status
- Health analysis results
- Weather monitoring alerts

### Health Checks

- Database connectivity
- Redis connection status
- Twilio API availability
- Queue job processing

## 🚨 Troubleshooting

### Common Issues

1. **"Invalid From and To pair" Error**

   - Ensure phone is connected to Twilio sandbox
   - Check sandbox number configuration
   - Verify webhook URL is accessible

2. **Queue Jobs Not Processing**

   - Check Redis connection
   - Verify worker process is running
   - Check job configuration

3. **Database Connection Issues**
   - Verify DATABASE_URL format
   - Check PostgreSQL server status
   - Run `npx prisma db push` to sync schema

### Debug Commands

```bash
# Check Redis connection
redis-cli ping

# Check database connection
npx prisma db pull

# Test Twilio connection
node test-twilio-config.js

# Monitor queue jobs
node -e "const { whatsappQueue } = require('./queue'); whatsappQueue.getJobs().then(console.log)"
```

## 🔒 Security & Privacy

### Data Protection

- Patient data encrypted in transit
- Secure webhook endpoints
- Message history retention policies
- HIPAA-compliant data handling

### Access Control

- Environment variable protection
- Webhook signature verification
- Rate limiting on API endpoints
- Secure database connections

## 📚 Development

### Adding New Features

1. **New Queue Jobs**: Add to `queue.js` and `worker.js`
2. **New Services**: Create in `services/` directory
3. **New Routes**: Add to `index.js`
4. **Database Changes**: Update `prisma/schema.prisma`

### Code Structure

```
├── index.js              # Main server
├── worker.js             # Background workers
├── queue.js              # Queue configuration
├── services/             # Business logic
├── jobs/                 # Cron job definitions
├── public/               # Static files
├── prisma/               # Database schema
└── utils/                 # Utility functions
```

## 📞 Support

For issues and questions:

- Check the troubleshooting section
- Review logs for error details
- Test individual components
- Verify environment configuration

---

**Storm Logic** - Intelligent health monitoring through weather-aware WhatsApp integration.
