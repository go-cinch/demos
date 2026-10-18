-- +migrate Up
-- Seed accounts, roles, user groups and other non-catalog defaults.
-- Assignment codes are resolved by the following action seed migration before startup completes.
INSERT INTO t_role (id, name, word, action) VALUES
    (1, 'Super', 'super', 'ACDFC75C'),
    (2, 'Guest', 'guest', '5S8CAATY'),
    (3, 'Admin', 'admin', 'REAC2MQB,5S8CAATY,WADGYR8Y,27NKE7BW,S6SBKX4B,M4CAAEYQ,6XY7LHRB,7NFH7GQ7,LYLX6DH7,YTP5BPRG,W8XNP7GN,X2W2Q288,SCJ34TWD,B6ATLRH5,XM8VGWWB,9Y8YL2AE,EJC6XPNJ,B9E8GRYG,VRYG9JWE,2N97H9EN,A9M4T4VB,EXHV3E7F,MVK3PYY4,5RAQS9J5,P4X5W7T8'),
    (4, 'Developer', 'developer', 'REAC2MQB,5S8CAATY,WADGYR8Y,27NKE7BW,S6SBKX4B,M4CAAEYQ,6XY7LHRB,7NFH7GQ7,LYLX6DH7,YTP5BPRG,W8XNP7GN,X2W2Q288,SCJ34TWD,B6ATLRH5,XM8VGWWB,9Y8YL2AE,EJC6XPNJ,B9E8GRYG,DKGN4TPF,HH5EFRD4,LFKNDE8Q,NTYM5NAC,VRYG9JWE,2N97H9EN,A9M4T4VB,EXHV3E7F,MVK3PYY4,5RAQS9J5,P4X5W7T8,DWKR57GJ'),
    (5, 'Operator', 'operator', 'REAC2MQB,5RAQS9J5');

INSERT INTO t_user_group (id, name, word, action) VALUES
    (1, 'Read Only', 'readonly', 'WADGYR8Y,6XY7LHRB,W8XNP7GN,XM8VGWWB'),
    (2, 'Read Write', 'write', 'WADGYR8Y,27NKE7BW,S6SBKX4B,M4CAAEYQ,6XY7LHRB,7NFH7GQ7,LYLX6DH7,YTP5BPRG,W8XNP7GN,X2W2Q288,SCJ34TWD,B6ATLRH5,XM8VGWWB,9Y8YL2AE,EJC6XPNJ,B9E8GRYG'),
    (3, 'No Delete', 'nodelete', 'WADGYR8Y,27NKE7BW,S6SBKX4B,6XY7LHRB,7NFH7GQ7,LYLX6DH7,W8XNP7GN,X2W2Q288,SCJ34TWD,XM8VGWWB,9Y8YL2AE,EJC6XPNJ');

-- Local seed credentials intentionally use the username as the password.
INSERT INTO t_user (id, role_id, username, code, password, status) VALUES
    (1, 1, 'super', 'E46J9BV6', '$2a$10$Wx41MADqB3kuLD/bdD8DIeph55Oeo9HABKGt2p2ilqdkHAfZ7EGPm', 1),
    (2, 2, 'guest', '2YFEHBTV', '$2a$10$DzWbkb12WHoyj5UPIAdHBOYXFi6jn5gzQRUoOU8c6oZ9XJx9w6Tju', 1),
    (3, NULL, 'readonly', 'VTT2FT8D', '$2a$10$e5bhTbZUo8JLBWOfxWY7A.BpiGCTgvV3PxIhPozM9UolwFuENjIZi', 1),
    (4, NULL, 'write', 'FXMXBYGG', '$2a$10$SB4cqKKE5t9ACvMXtHaJuOafN1nvJgdK.5XxVAITBCSsU.gSNTbAm', 1),
    (5, NULL, 'nodelete', 'MTEESEHP', '$2a$10$.QZNNNrOuEdPvV0UdYwEae942Bb7Hr28Zb0vrbBRocHUkSpqk/Uqu', 1),
    (6, 3, 'admin', '8S38DMTA', '$2a$10$30p0/2rXDEQMlENvObbsOOWEcQ/UtK7HwTnSph0OWg9YSXWWWADjm', 1),
    (7, 4, 'developer', 'NETDTXD6', '$2a$10$27TEL7BVoUIC1eBQaOsIueLPuoID2VA.2aIXAy4kcI5e3IaxwDIl.', 1),
    (8, 5, 'operator', 'EFA3RTDC', '$2a$10$ibw1wSobR/4DJhrPPey6.ekHt/1XuPwzf16D.MUpWQQHHz9k/yGJe', 1);

INSERT INTO t_user_user_group_relation (user_id, user_group_id) VALUES
    (3, 1),
    (4, 2),
    (5, 3);

-- A fresh schema has no messages; initialize zero-count statistics for seed users.
INSERT INTO t_user_msg_status (user_id)
SELECT id
FROM t_user
ORDER BY id;

SELECT setval(pg_get_serial_sequence('t_role', 'id'), (SELECT MAX(id) FROM t_role), TRUE);
SELECT setval(pg_get_serial_sequence('t_user_group', 'id'), (SELECT MAX(id) FROM t_user_group), TRUE);
SELECT setval(pg_get_serial_sequence('t_user', 'id'), (SELECT MAX(id) FROM t_user), TRUE);

-- +migrate Down
-- Clear the non-catalog auth tables and reset their sequences.
TRUNCATE TABLE
    t_audit_event,
    t_user_msg_status,
    t_msg_recipient,
    t_msg,
    t_user_user_group_relation,
    t_user,
    t_user_group,
    t_role
RESTART IDENTITY;
