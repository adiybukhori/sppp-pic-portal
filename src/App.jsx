import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API_URL =
  "https://script.google.com/macros/s/AKfycbytisjv4mLp9bW1CAu_93PsKpLlKD2LDSggVinQNwSQHhqAFzGix-R8a6bqpTWi0oDe/exec";

function money(n) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: "MYR",
    minimumFractionDigits: 2,
  }).format(Number(n || 0));
}

function badgeClass(value) {
  if (value === "Taken" || value === "Active" || value === "Clear") return "bg-emerald-100 text-emerald-700";
  if (value === "Ongoing" || value === "Partially Paid") return "bg-blue-100 text-blue-700";
  if (value === "Blocked" || value === "Unpaid" || value === "Outstanding") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-600";
}

function calculateFee(student) {
  const subjects = student.subjects || [];
  const totalFee = Number(student.totalFee || 0);
  const totalModule = Number(student.totalModule || subjects.length || 1);
  const feePerModule = Number(student.feePerModule || totalFee / totalModule || 0);

  const taken = subjects.filter((s) => s.status === "Taken").length;
  const ongoing = subjects.filter((s) => s.status === "Ongoing").length;
  const notYet = subjects.filter((s) => s.status === "Not Yet").length;
  const chargeable = taken + ongoing;
  const shouldPay = chargeable * feePerModule;
  const paidAmount = Number(student.paidAmount || 0);
  const outstanding = Math.max(shouldPay - paidAmount, 0);

  const paymentStatus =
    chargeable === 0 ? "No Module Yet" : paidAmount <= 0 ? "Unpaid" : paidAmount < shouldPay ? "Partially Paid" : "Clear";

  return { feePerModule, taken, ongoing, notYet, chargeable, shouldPay, outstanding, paymentStatus };
}

function normalizeStudent(raw) {
  return {
    id: raw.id || raw["Student ID"] || "",
    name: raw.name || raw["Student Name"] || "",
    ic: raw.ic || raw["IC/Passport"] || "",
    program: raw.program || raw["Program"] || "",
    intake: raw.intake || raw["Intake"] || "",
    category: raw.category || raw["Student Category"] || "",
    feeGroup: raw.feeGroup || raw["Fee Group"] || "",
    totalFee: Number(raw.totalFee || raw["Total Tuition Fee"] || 0),
    totalModule: Number(raw.totalModule || raw["Total Module"] || 0),
    feePerModule: Number(raw.feePerModule || raw["Fee Per Module"] || 0),
    paidAmount: Number(raw.paidAmount || raw["Paid Amount"] || 0),
    registrationFee: Number(raw.registrationFee || raw["Registration Fee"] || 300),
    convocationFee: Number(raw.convocationFee || raw["Convocation Fee"] || 700),
    lmsStatus: raw.lmsStatus || raw["LMS Status"] || "Pending Update",
    picRemark: raw.picRemark || raw["PIC Remark"] || "",
    subjects: (raw.subjects || []).map((s) => ({
      code: s.code || s.subjectCode || s["Subject Code"],
      name: s.name || s.subjectName || s["Subject Name"],
      status: s.status || s["Status"] || "Not Yet",
      displayOrder: s.displayOrder || s["Display Order"] || "",
    })),
  };
}

export default function PICPortalPreview() {
  const [students, setStudents] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [saved, setSaved] = useState(false);
  const [paymentInput, setPaymentInput] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadStudents() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(API_URL + "?action=getStudents");
      const data = await res.json();

      if (!data.success) {
        setError(data.message || "Unable to load student data.");
        setLoading(false);
        return;
      }

      const list = (data.students || []).map(normalizeStudent);
      setStudents(list);

      if (list.length > 0) {
        setSelectedId(list[0].id);
        setPaymentInput(list[0].paidAmount || 0);
      }
    } catch (err) {
      setError("Unable to connect to backend API.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStudents();
  }, []);

  const selected = students.find((s) => s.id === selectedId) || students[0];
  const selectedFee = selected ? calculateFee(selected) : null;

  const overall = useMemo(() => {
    const blocked = students.filter((s) => s.lmsStatus === "Blocked").length;
    const totalOutstanding = students.reduce((sum, s) => sum + calculateFee(s).outstanding, 0);
    const clear = students.filter((s) => calculateFee(s).paymentStatus === "Clear").length;
    return { total: students.length, blocked, totalOutstanding, clear };
  }, [students]);

  const filteredStudents = students.filter((student) => {
    const fee = calculateFee(student);
    const keyword = `${student.name} ${student.id} ${student.ic}`.toLowerCase();
    const matchSearch = keyword.includes(search.toLowerCase());
    const matchFilter =
      filter === "All" ||
      (filter === "Outstanding" && fee.outstanding > 0) ||
      (filter === "LMS Blocked" && student.lmsStatus === "Blocked") ||
      (filter === "Clear" && fee.paymentStatus === "Clear");
    return matchSearch && matchFilter;
  });

  function updateSelected(updates) {
    setSaved(false);
    setStudents((prev) => prev.map((s) => (s.id === selected.id ? { ...s, ...updates } : s)));
  }

  function updateSubject(code, status) {
    setSaved(false);
    setStudents((prev) =>
      prev.map((s) =>
        s.id === selected.id
          ? {
              ...s,
              subjects: s.subjects.map((sub) => (sub.code === code ? { ...sub, status } : sub)),
            }
          : s
      )
    );
  }

  async function saveUpdate() {
    if (!selected) return;

    setSaved(false);
    setError("");

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({
          action: "savePicUpdate",
          studentId: selected.id,
          paidAmount: Number(selected.paidAmount || 0),
          lmsStatus: selected.lmsStatus,
          picRemark: selected.picRemark,
          subjects: selected.subjects.map((s) => ({
            subjectCode: s.code,
            status: s.status,
            displayOrder: s.displayOrder || "",
          })),
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.message || "Save failed.");
        return;
      }

      setSaved(true);
      await loadStudents();
    } catch (err) {
      setError("Unable to save update.");
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-600">Loading PIC Portal...</div>;
  }

  if (error && students.length === 0) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <Card className="rounded-3xl shadow-sm max-w-lg w-full">
          <CardContent className="p-6">
            <h2 className="font-bold text-lg text-red-600">API Error</h2>
            <p className="text-sm text-slate-600 mt-2">{error}</p>
            <Button onClick={loadStudents} className="mt-4 rounded-2xl">Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!selected || !selectedFee) {
    return <div className="min-h-screen bg-slate-100 flex items-center justify-center text-slate-600">No student data found.</div>;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="bg-gradient-to-r from-slate-950 to-blue-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-sm text-blue-100">Innovative University College</p>
            <h1 className="text-2xl font-bold">PIC Update Portal</h1>
            <p className="text-sm text-blue-100">Programme access: {selected.program || "Assigned Programme"}</p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" className="rounded-2xl" onClick={loadStudents}>Refresh Data</Button>
            <Button variant="secondary" className="rounded-2xl">Logout</Button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-6 space-y-6">
        {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat title="Total Students" value={overall.total} />
          <Stat title="Total Outstanding" value={money(overall.totalOutstanding)} danger={overall.totalOutstanding > 0} />
          <Stat title="LMS Blocked" value={overall.blocked} danger={overall.blocked > 0} />
          <Stat title="Payment Clear" value={overall.clear} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card className="rounded-3xl shadow-sm lg:col-span-4">
            <CardContent className="p-5">
              <div className="mb-4">
                <h2 className="font-bold text-lg">Student List</h2>
                <p className="text-xs text-slate-500">PIC can only view students under assigned programme.</p>
              </div>

              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name / student ID / IC" className="mb-3" />

              <div className="grid grid-cols-2 gap-2 mb-4">
                {["All", "Outstanding", "LMS Blocked", "Clear"].map((item) => (
                  <Button key={item} variant={filter === item ? "default" : "outline"} className="rounded-xl text-xs" onClick={() => setFilter(item)}>
                    {item}
                  </Button>
                ))}
              </div>

              <div className="space-y-2 max-h-[760px] overflow-y-auto pr-2 pb-4">
                {filteredStudents.map((student) => {
                  const fee = calculateFee(student);
                  return (
                    <div
                      key={student.id}
                      onClick={() => {
                        setSelectedId(student.id);
                        setPaymentInput(student.paidAmount);
                        setSaved(false);
                      }}
                      className={`p-3 rounded-2xl border cursor-pointer transition shadow-sm ${
                        selected.id === student.id
                          ? "bg-blue-50 border-blue-300"
                          : "bg-white border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-slate-900">{student.name}</p>
                          <p className="text-xs text-slate-500">{student.id} · {student.intake}</p>
                        </div>
                        <span className={`text-[11px] px-2 py-1 rounded-full font-semibold ${badgeClass(fee.paymentStatus)}`}>{fee.paymentStatus}</span>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-1.5">
                          <p className="text-slate-500">Outstanding</p>
                          <p className={fee.outstanding > 0 ? "font-bold text-red-600" : "font-bold text-emerald-700"}>{money(fee.outstanding)}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-100 px-2 py-1.5">
                          <p className="text-slate-500">LMS</p>
                          <p className={student.lmsStatus === "Blocked" ? "font-bold text-red-600" : "font-bold text-slate-900"}>{student.lmsStatus}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="lg:col-span-8 space-y-6">
            <Card className="rounded-3xl border border-slate-200 shadow-sm">
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">{selected.name}</h2>
                    <p className="text-sm text-slate-500">{selected.id} · {selected.ic}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-blue-100 text-blue-700 px-3 py-1 text-xs font-bold">{selected.program}</span>
                    <span className="rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs font-bold">{selected.category}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${badgeClass(selected.lmsStatus)}`}>LMS: {selected.lmsStatus}</span>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <MiniInfo label="Intake" value={selected.intake} />
                  <MiniInfo label="Fee Group" value={selected.feeGroup} />
                  <MiniInfo label="Chargeable" value={`${selectedFee.chargeable} module`} />
                  <MiniInfo label="Outstanding" value={money(selectedFee.outstanding)} danger={selectedFee.outstanding > 0} />
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="rounded-3xl shadow-sm md:col-span-2">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-lg">Academic Progress Update</h3>
                      <p className="text-xs text-slate-500">Update status only. Results, marks and CGPA remain in Sky Vialing.</p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <p>{selectedFee.taken} Taken</p>
                      <p>{selectedFee.ongoing} Ongoing</p>
                      <p>{selectedFee.notYet} Not Yet</p>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="text-left p-3">Subject</th>
                          <th className="text-left p-3 w-44">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.subjects.map((subject) => (
                          <tr key={subject.code} className="border-t border-slate-200">
                            <td className="p-3">
                              <p className="font-semibold text-slate-900">{subject.code}</p>
                              <p className="text-xs text-slate-500">{subject.name}</p>
                            </td>
                            <td className="p-3">
                              <select
                                value={subject.status}
                                onChange={(e) => updateSubject(subject.code, e.target.value)}
                                className="w-full rounded-xl border border-slate-200 p-2 bg-white text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                              >
                                <option>Not Yet</option>
                                <option>Ongoing</option>
                                <option>Taken</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="rounded-3xl border border-slate-200 shadow-sm">
                  <CardContent className="p-6">
                    <h3 className="font-bold text-lg mb-4">Payment Update</h3>
                    <div className="space-y-3 text-sm">
                      <Row label="Tuition Fee" value={money(selected.totalFee)} />
                      <Row label="Fee / Module" value={money(selectedFee.feePerModule)} />
                      <Row label="Should Pay" value={money(selectedFee.shouldPay)} />
                      <Row label="Paid Amount" value={money(selected.paidAmount)} />

                      <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3 shadow-sm">
                        <label className="text-xs text-slate-500">Update Paid Amount</label>
                        <Input type="number" value={paymentInput} onChange={(e) => setPaymentInput(e.target.value)} className="bg-white border border-slate-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100" />
                        <Button variant="outline" className="w-full rounded-xl text-xs bg-white border border-slate-200 shadow-sm hover:bg-slate-50" onClick={() => updateSelected({ paidAmount: Number(paymentInput || 0) })}>
                          Update Paid Amount
                        </Button>
                      </div>

                      <div className="border-t border-slate-200 pt-3">
                        <Row label="Outstanding" value={money(selectedFee.outstanding)} strong danger={selectedFee.outstanding > 0} />
                        <div className="mt-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${badgeClass(selectedFee.paymentStatus)}`}>
                            {selectedFee.paymentStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-3xl border border-slate-200 shadow-sm">
                  <CardContent className="p-6 space-y-4">
                    <div>
                      <label className="text-xs text-slate-500">LMS Status</label>
                      <select
                        value={selected.lmsStatus}
                        onChange={(e) => updateSelected({ lmsStatus: e.target.value })}
                        className="w-full mt-1 rounded-xl border border-slate-200 p-2 bg-white text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                      >
                        <option>Active</option>
                        <option>Blocked</option>
                        <option>Pending Update</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-slate-500">PIC Remark</label>
                      <textarea
                        value={selected.picRemark}
                        onChange={(e) => updateSelected({ picRemark: e.target.value })}
                        className="w-full mt-1 rounded-xl border border-slate-200 p-3 min-h-24 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    <Button className="w-full rounded-2xl bg-blue-950 hover:bg-blue-900" onClick={saveUpdate}>
                      Save Update
                    </Button>
                    {saved && <p className="text-sm text-emerald-700 font-medium">Saved successfully. Data updated in Google Sheet.</p>}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Stat({ title, value, danger }) {
  return (
    <Card className="rounded-3xl border border-slate-200 shadow-sm">
      <CardContent className="p-5">
        <p className="text-xs text-slate-500">{title}</p>
        <p className={`mt-1 text-xl font-bold ${danger ? "text-red-600" : "text-slate-900"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function MiniInfo({ label, value, danger }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`font-bold mt-1 ${danger ? "text-red-600" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, strong, danger }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className={`${strong ? "font-bold" : "font-medium"} ${danger ? "text-red-600" : "text-slate-900"}`}>{value}</span>
    </div>
  );
}
