create or replace function public.can_parent_view_learning_activity(_activity_id uuid, _parent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.learning_activities la
    join public.learning_activity_students las on las.activity_id = la.id
    join public.parent_students ps on ps.student_id = las.student_id
    where la.id = _activity_id
      and la.visible_to_parents = true
      and ps.parent_id = _parent_id
      and ps.status = 'approved'
  )
$$;

create or replace function public.can_parent_view_learning_activity_student(_activity_id uuid, _student_id uuid, _parent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.learning_activities la
    join public.parent_students ps on ps.student_id = _student_id
    where la.id = _activity_id
      and la.visible_to_parents = true
      and ps.parent_id = _parent_id
      and ps.status = 'approved'
  )
$$;

drop policy if exists parents_view_shared_activities on public.learning_activities;
create policy parents_view_shared_activities
on public.learning_activities
for select
to authenticated
using (public.can_parent_view_learning_activity(id, auth.uid()));

drop policy if exists view_media on public.learning_activity_media;
create policy view_media
on public.learning_activity_media
for select
to authenticated
using (
  exists (
    select 1
    from public.learning_activities la
    where la.id = learning_activity_media.activity_id
      and (is_super_admin(auth.uid()) or is_member_of_branch(auth.uid(), la.branch_id))
  )
  or public.can_parent_view_learning_activity(activity_id, auth.uid())
);

drop policy if exists view_student_tags on public.learning_activity_students;
create policy view_student_tags
on public.learning_activity_students
for select
to authenticated
using (
  exists (
    select 1
    from public.learning_activities la
    where la.id = learning_activity_students.activity_id
      and (is_super_admin(auth.uid()) or is_member_of_branch(auth.uid(), la.branch_id))
  )
  or public.can_parent_view_learning_activity_student(activity_id, student_id, auth.uid())
);