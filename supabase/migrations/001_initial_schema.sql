-- Migration: 001_initial_schema.sql
-- Description: Approved database schema reference for Lost Phones Management System
-- Tables: users, lost_phones, phone_images, report_status_history, audit_logs, police_stations

-- ============================================================================
-- 1. USERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_name VARCHAR(150),
    owner_name VARCHAR(150),
    area VARCHAR(100),
    address TEXT,
    phone VARCHAR(30) UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    status BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. POLICE STATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS police_stations (
    id BIGSERIAL PRIMARY KEY,
    station_name VARCHAR(150) NOT NULL,
    area VARCHAR(100) NOT NULL,
    phone_number VARCHAR(30) NOT NULL,
    address TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. LOST PHONES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS lost_phones (
    id BIGSERIAL PRIMARY KEY,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(150) NOT NULL,
    serial_number VARCHAR(150),
    imei VARCHAR(50),
    imei2 VARCHAR(50),
    color VARCHAR(50),
    storage VARCHAR(50),
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'lost' CHECK (status IN ('lost', 'found', 'hidden')),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    visible_until TIMESTAMPTZ,
    found_at TIMESTAMPTZ,
    found_by UUID REFERENCES users(id) ON DELETE SET NULL,
    hidden_at TIMESTAMPTZ,
    hidden_by UUID REFERENCES users(id) ON DELETE SET NULL,
    contact VARCHAR(30),
    contact2 VARCHAR(30)
);

-- ============================================================================
-- 4. PHONE IMAGES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS phone_images (
    id BIGSERIAL PRIMARY KEY,
    phone_id BIGINT NOT NULL REFERENCES lost_phones(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. REPORT STATUS HISTORY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS report_status_history (
    id BIGSERIAL PRIMARY KEY,
    phone_id BIGINT NOT NULL REFERENCES lost_phones(id) ON DELETE CASCADE,
    old_status VARCHAR(20) CHECK (old_status IS NULL OR old_status IN ('lost', 'found', 'hidden')),
    new_status VARCHAR(20) NOT NULL CHECK (new_status IN ('lost', 'found', 'hidden')),
    changed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. AUDIT LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(100),
    entity_id BIGINT,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- lost_phones indexes
CREATE INDEX IF NOT EXISTS idx_lost_phones_imei ON lost_phones(imei);
CREATE INDEX IF NOT EXISTS idx_lost_phones_imei2 ON lost_phones(imei2);
CREATE INDEX IF NOT EXISTS idx_lost_phones_serial_number ON lost_phones(serial_number);
CREATE INDEX IF NOT EXISTS idx_lost_phones_status_visible_until ON lost_phones(status, visible_until);
CREATE INDEX IF NOT EXISTS idx_lost_phones_created_by ON lost_phones(created_by);
CREATE INDEX IF NOT EXISTS idx_lost_phones_found_by ON lost_phones(found_by);
CREATE INDEX IF NOT EXISTS idx_lost_phones_hidden_by ON lost_phones(hidden_by);

-- phone_images indexes
CREATE INDEX IF NOT EXISTS idx_phone_images_phone_id ON phone_images(phone_id);

-- report_status_history indexes
CREATE INDEX IF NOT EXISTS idx_report_status_history_phone_created ON report_status_history(phone_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_status_history_changed_by ON report_status_history(changed_by);

-- audit_logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- police_stations indexes
CREATE INDEX IF NOT EXISTS idx_police_stations_area ON police_stations(area);
CREATE INDEX IF NOT EXISTS idx_police_stations_phone_number ON police_stations(phone_number);
