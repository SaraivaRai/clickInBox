SET client_encoding = 'UTF8';

INSERT INTO fotos (box_id, usuario_id, arquivo, criado_em)
VALUES
  (4, 14, 'uploads/box-4/album/01.jpg', NOW()),
  (4, 8,  'uploads/box-4/album/02.jpg', NOW() - INTERVAL '1 second'),
  (4, 5,  'uploads/box-4/album/03.jpg', NOW() - INTERVAL '2 seconds'),
  (4, 10, 'uploads/box-4/album/04.jpg', NOW() - INTERVAL '3 seconds'),
  (4, 12, 'uploads/box-4/album/05.jpg', NOW() - INTERVAL '4 seconds'),
  (4, 7,  'uploads/box-4/album/06.jpg', NOW() - INTERVAL '5 seconds'),
  (4, 15, 'uploads/box-4/album/07.jpg', NOW() - INTERVAL '6 seconds'),
  (4, 6,  'uploads/box-4/album/08.jpg', NOW() - INTERVAL '7 seconds'),
  (4, 11, 'uploads/box-4/album/09.jpg', NOW() - INTERVAL '8 seconds'),
  (4, 13, 'uploads/box-4/album/10.jpg', NOW() - INTERVAL '9 seconds'),
  (4, 9,  'uploads/box-4/album/11.jpg', NOW() - INTERVAL '10 seconds'),
  (4, 4,  'uploads/box-4/album/12.jpg', NOW() - INTERVAL '11 seconds'),
  (4, 7,  'uploads/box-4/album/13.jpg', NOW() - INTERVAL '12 seconds'),
  (4, 14, 'uploads/box-4/album/14.jpg', NOW() - INTERVAL '13 seconds'),
  (4, 8,  'uploads/box-4/album/15.jpg', NOW() - INTERVAL '14 seconds'),
  (4, 10, 'uploads/box-4/album/16.jpg', NOW() - INTERVAL '15 seconds'),
  (4, 15, 'uploads/box-4/album/17.jpg', NOW() - INTERVAL '16 seconds'),
  (4, 12, 'uploads/box-4/album/18.jpg', NOW() - INTERVAL '17 seconds'),
  (4, 5,  'uploads/box-4/album/19.jpg', NOW() - INTERVAL '18 seconds'),
  (4, 11, 'uploads/box-4/album/20.jpg', NOW() - INTERVAL '19 seconds'),
  (4, 4,  'uploads/box-4/album/21.jpg', NOW() - INTERVAL '20 seconds');