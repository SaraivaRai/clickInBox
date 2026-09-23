INSERT INTO convites (box_id, papel, token, limite_usos)
SELECT
  boxes.id,
  'cerimonialista',
  REPLACE(gen_random_uuid()::TEXT, '-', '') ||
    REPLACE(gen_random_uuid()::TEXT, '-', ''),
  1
FROM boxes
WHERE NOT EXISTS (
  SELECT 1
  FROM convites
  WHERE convites.box_id = boxes.id
    AND convites.papel = 'cerimonialista'
);
