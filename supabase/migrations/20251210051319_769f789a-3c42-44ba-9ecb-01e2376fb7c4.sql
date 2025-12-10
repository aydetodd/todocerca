-- Add unique constraint on tracker_id for upsert functionality
ALTER TABLE public.gps_tracker_locations 
ADD CONSTRAINT gps_tracker_locations_tracker_id_unique UNIQUE (tracker_id);

-- Enable realtime for gps_tracker_locations
ALTER TABLE public.gps_tracker_locations REPLICA IDENTITY FULL;