-- Schema for Intelliform (reference)

CREATE TABLE IF NOT EXISTS dqai_users (
  id SERIAL PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  email TEXT UNIQUE,
  password TEXT,
  role TEXT,
  status TEXT,
  facility_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dqai_programs (
  id SERIAL PRIMARY KEY,
  name TEXT,
  details TEXT,
  type TEXT,
  category TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dqai_facilities (
  id SERIAL PRIMARY KEY,
  name TEXT,
  state TEXT,
  lga TEXT,
  address TEXT,
  category TEXT
);

CREATE TABLE IF NOT EXISTS dqai_activities (
  id SERIAL PRIMARY KEY,
  title TEXT,
  subtitle TEXT,
  program_id INTEGER REFERENCES programs(id) ON DELETE SET NULL,
  details TEXT,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  response_type TEXT,
  category TEXT,
  status TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  form_definition JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dqai_activity_reports (
  id SERIAL PRIMARY KEY,
  activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  facility_id INTEGER REFERENCES facilities(id) ON DELETE SET NULL,
  status TEXT,
  answers JSONB,
  reviewers_report TEXT,
  overall_score NUMERIC,
  reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  submission_date TIMESTAMP DEFAULT NOW()
);

-- Questions and Answers: persisted form schema and per-report answers
-- Questions: store page/section names and full question metadata
CREATE TABLE IF NOT EXISTS dqai_questions (
  id TEXT PRIMARY KEY,
  activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  page_name TEXT,
  section_name TEXT,
  question_text TEXT,
  question_helper TEXT,
  answer_type TEXT,
  category TEXT,
  question_group TEXT,
  column_size INTEGER,
  required BOOLEAN DEFAULT FALSE,
  status TEXT,
  options JSONB,
  metadata JSONB,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
 
-- Answers: store each answer with references for querying and grouping
CREATE TABLE IF NOT EXISTS dqai_answers (
  id SERIAL PRIMARY KEY,
  report_id INTEGER REFERENCES activity_reports(id) ON DELETE CASCADE,
  activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  question_id TEXT,
  answer_value JSONB,
  facility_id INTEGER REFERENCES facilities(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  answer_datetime TIMESTAMP DEFAULT NOW(),
  reviewers_comment TEXT,
  quality_improvement_followup TEXT,
  score NUMERIC,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Uploaded documents (excel files) stored as JSONB content per activity/facility/user
CREATE TABLE IF NOT EXISTS dqai_uploaded_docs (
  id SERIAL PRIMARY KEY,
  activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
  facility_id INTEGER REFERENCES facilities(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  file_content JSONB,
  filename TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
