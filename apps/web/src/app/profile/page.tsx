export default function ProfilePage() {
	return (
		<main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
			<div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
				<p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Static Profile</p>
				<h1 className="mt-1 text-3xl font-semibold">Candidate Profile Preview</h1>
				<p className="mt-2 text-sm text-slate-600">
					This is a simple static profile page for testing UI flow.
				</p>

				<div className="mt-6 grid gap-4 sm:grid-cols-2">
					<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
						<p className="text-xs uppercase tracking-[0.08em] text-slate-500">Full name</p>
						<p className="mt-1 font-semibold">Salma Idrissi</p>
					</div>
					<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
						<p className="text-xs uppercase tracking-[0.08em] text-slate-500">Email</p>
						<p className="mt-1 font-semibold">salma.idrissi@example.com</p>
					</div>
					<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
						<p className="text-xs uppercase tracking-[0.08em] text-slate-500">Field</p>
						<p className="mt-1 font-semibold">Software Engineering</p>
					</div>
					<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
						<p className="text-xs uppercase tracking-[0.08em] text-slate-500">City</p>
						<p className="mt-1 font-semibold">Casablanca</p>
					</div>
				</div>

				<section className="mt-6 rounded-xl border border-slate-200 p-4">
					<h2 className="text-lg font-semibold">About</h2>
					<p className="mt-2 text-sm leading-6 text-slate-700">
						Junior developer focused on full stack applications, team collaboration, and clean user
						interfaces.
					</p>
				</section>
			</div>
		</main>
	);
}
