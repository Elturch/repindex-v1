-- Assign admin role to maturci@gmail.com
INSERT INTO public.user_roles (user_id, role)
VALUES ('1ebf57d7-c5c7-48fa-af47-6abff02db520', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;