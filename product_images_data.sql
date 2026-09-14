--
-- PostgreSQL database dump
--

\restrict CDTT7kMfFtbgDdQ2wX0FJMVFur9VNST2fp09hfFta1onr8xO9DejB7cqAzewRo2

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: product_images; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.product_images (id, product_id, storage_path, alt_text, sort_order, is_primary, created_at) FROM stdin;
1	1	http://127.0.0.1:54321/storage/v1/object/public/product_image/necklace.webp	گردنبند	0	t	2026-09-09 14:15:14.486913+00
2	2	http://127.0.0.1:54321/storage/v1/object/public/product_image/dean_blunt_pendant.webp	پلاک دین بلانت	0	t	2026-09-09 14:15:57.089903+00
3	3	http://127.0.0.1:54321/storage/v1/object/public/product_image/salib_pendant.webp	پلاک صلیب	0	t	2026-09-09 14:16:15.588996+00
4	4	http://127.0.0.1:54321/storage/v1/object/public/product_image/aphex_pendant.webp	پلاک ایفکس تویین	0	t	2026-09-09 14:16:31.174064+00
\.


--
-- Name: product_images_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_images_id_seq', 4, true);


--
-- PostgreSQL database dump complete
--

\unrestrict CDTT7kMfFtbgDdQ2wX0FJMVFur9VNST2fp09hfFta1onr8xO9DejB7cqAzewRo2

