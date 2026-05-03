-- Add comment field to enrollment records
ALTER TABLE enrollments
ADD COLUMN comment TEXT;
