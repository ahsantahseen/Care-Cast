-- Create tables for Storm Logic Health Monitoring System
-- Run this in your Supabase SQL Editor

-- Patients table
CREATE TABLE IF NOT EXISTS public.patients (
    id SERIAL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "phoneNumber" TEXT UNIQUE NOT NULL,
    zipcode TEXT NOT NULL,
    age INTEGER NOT NULL,
    "optOutCustomMessages" BOOLEAN DEFAULT false,
    "consentGiven" BOOLEAN DEFAULT false,
    "consentDate" TIMESTAMP,
    "familyContactName" TEXT,
    "familyContactPhone" TEXT,
    "familyContactRelation" TEXT,
    "familyContactConsent" BOOLEAN DEFAULT false,
    "healthcareProviderName" TEXT,
    "healthcareProviderHospital" TEXT,
    "healthcareProviderPhone" TEXT,
    "healthcareProviderConsent" BOOLEAN DEFAULT false,
    medications JSONB,
    "preExistingConditions" JSONB,
    "chronicConditions" JSONB,
    hospital TEXT,
    "dialysisSchedule" TEXT,
    smoker BOOLEAN DEFAULT false,
    "isPregnant" BOOLEAN DEFAULT false,
    "activityLevel" TEXT DEFAULT 'moderate',
    "riskLevel" TEXT DEFAULT 'medium',
    "monitoringEnabled" BOOLEAN DEFAULT true,
    "preferredLanguage" TEXT DEFAULT 'en',
    "registrationComplete" BOOLEAN DEFAULT false,
    "lastHealthCheck" TIMESTAMP,
    "lastRiskLevel" TEXT,
    "lastUrgency" TEXT,
    "lastEscalationLevel" TEXT,
    "lastMonitoringInterval" INTEGER,
    "lastSymptomText" TEXT,
    "lastAnalysisTimestamp" TIMESTAMP,
    "lastWeatherTemp" DOUBLE PRECISION,
    "lastWeatherHumidity" DOUBLE PRECISION,
    "confidenceScore" DOUBLE PRECISION,
    "emergencyAlerted" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS public.messages (
    id SERIAL PRIMARY KEY,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    body TEXT NOT NULL,
    direction TEXT NOT NULL,
    "messageType" TEXT DEFAULT 'whatsapp',
    "messageSid" TEXT,
    status TEXT,
    "errorMessage" TEXT,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "numMedia" INTEGER DEFAULT 0,
    "patientId" INTEGER REFERENCES public.patients(id),
    "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Health Analyses table
CREATE TABLE IF NOT EXISTS public.health_analyses (
    id SERIAL PRIMARY KEY,
    "patientId" INTEGER NOT NULL REFERENCES public.patients(id),
    "symptomsText" TEXT NOT NULL,
    "currentTemperature" DOUBLE PRECISION,
    "riskLevel" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    "symptomsDetected" JSONB,
    reasoning JSONB,
    "immediateActions" JSONB,
    "monitoringPattern" TEXT NOT NULL,
    "monitoringIntervals" JSONB,
    "monitoringDuration" INTEGER NOT NULL,
    "responseMessage" TEXT NOT NULL,
    "monitoringScheduled" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Monitoring Jobs table
CREATE TABLE IF NOT EXISTS public.monitoring_jobs (
    id SERIAL PRIMARY KEY,
    "patientId" INTEGER NOT NULL REFERENCES public.patients(id),
    "jobType" TEXT NOT NULL,
    "jobId" TEXT UNIQUE NOT NULL,
    "riskLevel" TEXT,
    "checkNumber" INTEGER,
    "totalChecks" INTEGER,
    status TEXT DEFAULT 'scheduled',
    "scheduledFor" TIMESTAMP NOT NULL,
    "completedAt" TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_patients_phone ON public.patients("phoneNumber");
CREATE INDEX IF NOT EXISTS idx_patients_zipcode ON public.patients(zipcode);
CREATE INDEX IF NOT EXISTS idx_messages_patient ON public.messages("patientId");
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages("createdAt");
CREATE INDEX IF NOT EXISTS idx_health_analyses_patient ON public.health_analyses("patientId");
CREATE INDEX IF NOT EXISTS idx_monitoring_jobs_patient ON public.monitoring_jobs("patientId");
CREATE INDEX IF NOT EXISTS idx_monitoring_jobs_status ON public.monitoring_jobs(status);

-- Insert a test patient for weather monitoring
INSERT INTO public.patients (
    "firstName", 
    "phoneNumber", 
    zipcode, 
    age, 
    "consentGiven", 
    "registrationComplete",
    "chronicConditions",
    medications,
    "activityLevel"
) VALUES (
    'Test User', 
    '+19342120686', 
    '85001', 
    75, 
    true, 
    true,
    '["diabetes", "heart_disease"]'::jsonb,
    '["metformin", "lisinopril"]'::jsonb,
    'low'
) ON CONFLICT ("phoneNumber") DO NOTHING;

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_jobs ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies for patients table
-- Policy: Patients can only access their own data
CREATE POLICY "patients_select_own" ON public.patients
    FOR SELECT USING (auth.uid()::text = "phoneNumber" OR auth.role() = 'service_role');

CREATE POLICY "patients_update_own" ON public.patients
    FOR UPDATE USING (auth.uid()::text = "phoneNumber" OR auth.role() = 'service_role');

CREATE POLICY "patients_insert_own" ON public.patients
    FOR INSERT WITH CHECK (auth.uid()::text = "phoneNumber" OR auth.role() = 'service_role');

-- Policy: System can access all patient data (for weather monitoring, etc.)
CREATE POLICY "patients_system_access" ON public.patients
    FOR ALL USING (auth.role() = 'service_role');

-- Create RLS Policies for messages table
-- Policy: Patients can only see their own messages
CREATE POLICY "messages_select_own" ON public.messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.patients 
            WHERE patients.id = messages."patientId" 
            AND (patients."phoneNumber" = auth.uid()::text OR auth.role() = 'service_role')
        )
    );

CREATE POLICY "messages_insert_system" ON public.messages
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Create RLS Policies for health_analyses table
-- Policy: Patients can only see their own health analyses
CREATE POLICY "health_analyses_select_own" ON public.health_analyses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.patients 
            WHERE patients.id = health_analyses."patientId" 
            AND (patients."phoneNumber" = auth.uid()::text OR auth.role() = 'service_role')
        )
    );

CREATE POLICY "health_analyses_insert_system" ON public.health_analyses
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Create RLS Policies for monitoring_jobs table
-- Policy: System-only access for monitoring jobs
CREATE POLICY "monitoring_jobs_system_only" ON public.monitoring_jobs
    FOR ALL USING (auth.role() = 'service_role');

-- Create a function to handle patient authentication via phone number
-- This allows patients to authenticate using their phone number as the user ID
CREATE OR REPLACE FUNCTION public.authenticate_patient(phone_number text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Verify the patient exists
    IF NOT EXISTS (SELECT 1 FROM public.patients WHERE "phoneNumber" = phone_number) THEN
        RAISE EXCEPTION 'Patient not found';
    END IF;
    
    -- Set the user context (this would typically be done via JWT in a real app)
    PERFORM set_config('request.jwt.claims', 
        json_build_object('sub', phone_number, 'role', 'authenticated')::text, true);
END;
$$;

-- Create a function for system operations (weather monitoring, etc.)
CREATE OR REPLACE FUNCTION public.system_operation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Set system role for automated operations
    PERFORM set_config('request.jwt.claims', 
        json_build_object('role', 'service_role')::text, true);
END;
$$;

-- Grant necessary permissions
-- Allow authenticated users to read their own data
GRANT SELECT ON public.patients TO authenticated;
GRANT SELECT ON public.messages TO authenticated;
GRANT SELECT ON public.health_analyses TO authenticated;

-- Allow service role (your backend) full access
GRANT ALL ON public.patients TO service_role;
GRANT ALL ON public.messages TO service_role;
GRANT ALL ON public.health_analyses TO service_role;
GRANT ALL ON public.monitoring_jobs TO service_role;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

SELECT 'Database setup complete with RLS! Tables created, test patient added, and security policies enabled.' as result;
