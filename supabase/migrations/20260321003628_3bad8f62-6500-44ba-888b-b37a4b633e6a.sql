UPDATE qr_tickets 
SET is_transferred = false, 
    transferred_to = null, 
    transfer_expires_at = null
WHERE id = '2e87014f-f9a2-4dea-83b2-368446160f8a' 
  AND status = 'active' 
  AND is_transferred = true;