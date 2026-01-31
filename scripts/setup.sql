-- AI Voice Automation Database Schema
-- Run this SQL in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_call_at TIMESTAMP WITH TIME ZONE,
    total_appointments INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;

-- Appointments table
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_name VARCHAR(100) NOT NULL,
    patient_phone VARCHAR(20) NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    start_time_utc TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time_utc TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    call_sid VARCHAR(100),
    session_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(50) DEFAULT 'system',
    notes TEXT,
    CONSTRAINT valid_status CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show', 'rescheduled'))
);

CREATE INDEX idx_appointments_user ON appointments(user_id);
CREATE INDEX idx_appointments_phone ON appointments(patient_phone);
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_start_time ON appointments(start_time_utc);
CREATE INDEX idx_appointments_call_sid ON appointments(call_sid) WHERE call_sid IS NOT NULL;

-- Call logs table
CREATE TABLE IF NOT EXISTS call_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_sid VARCHAR(100) UNIQUE NOT NULL,
    session_id VARCHAR(100),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    from_number VARCHAR(20) NOT NULL,
    to_number VARCHAR(20) NOT NULL,
    direction VARCHAR(10) NOT NULL DEFAULT 'inbound',
    status VARCHAR(20) NOT NULL,
    duration INTEGER,
    recording_url TEXT,
    intent_type VARCHAR(50),
    intent_data JSONB,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT valid_direction CHECK (direction IN ('inbound', 'outbound'))
);

CREATE INDEX idx_call_logs_call_sid ON call_logs(call_sid);
CREATE INDEX idx_call_logs_session_id ON call_logs(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_call_logs_user ON call_logs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_call_logs_created_at ON call_logs(created_at);

-- Function to increment appointment count
CREATE OR REPLACE FUNCTION increment_appointment_count(user_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE users
    SET total_appointments = total_appointments + 1,
        updated_at = NOW()
    WHERE id = user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
    BEFORE UPDATE ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) - Optional but recommended
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

-- Create policies as needed for your security requirements
-- Example: Allow service role full access
-- CREATE POLICY "Service role has full access" ON users
--     FOR ALL
--     TO service_role
--     USING (true)
--     WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_appointments_time_range ON appointments(start_time_utc, end_time_utc);
CREATE INDEX idx_appointments_active ON appointments(status, appointment_date) 
    WHERE status IN ('scheduled', 'confirmed');

-- Comments for documentation
COMMENT ON TABLE users IS 'Stores user/patient information';
COMMENT ON TABLE appointments IS 'Stores appointment bookings';
COMMENT ON TABLE call_logs IS 'Stores call history and metadata';

COMMENT ON COLUMN appointments.start_time_utc IS 'Appointment start time in UTC for conflict detection';
COMMENT ON COLUMN appointments.end_time_utc IS 'Appointment end time in UTC for conflict detection';
COMMENT ON COLUMN call_logs.intent_data IS 'Structured data extracted from AI agent';
