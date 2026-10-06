"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type FormAction } from "@/components/action-form";

type Participant = { id: string; name: string };
type Template = { name: string; layout: string; sections: string[] };
type DiscussionSection = { heading: string; topics: string[] };
type AssignedTask = { title: string; assignedToId: string; dueAt: string };

export function TeamMeetingMinutesEditor({
  action,
  meetingId,
  meetingTitle,
  meetingDate,
  firmName,
  logoUrl,
  brandColour,
  template,
  participants,
  canAssignTasks,
}: {
  action: FormAction;
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  firmName: string;
  logoUrl: string;
  brandColour: string;
  template: Template;
  participants: Participant[];
  canAssignTasks: boolean;
}) {
  const initialHeadings = template.sections.filter((section) => !["Attendees", "Actions", "Action items", "Message of the week"].includes(section));
  const [messageOfWeek, setMessageOfWeek] = useState("");
  const [sections, setSections] = useState<DiscussionSection[]>(() => (initialHeadings.length ? initialHeadings : ["Discussion"]).map((heading) => ({ heading, topics: [""] })));
  const [attendingIds, setAttendingIds] = useState<string[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
  const layout = ["modern", "formal", "editorial"].includes(template.layout) ? template.layout : "modern";
  const minutesData = JSON.stringify({ layout, messageOfWeek, attendingIds, sections, assignedTasks });

  const updateSection = (sectionIndex: number, update: Partial<DiscussionSection>) => {
    setSections((current) => current.map((section, index) => index === sectionIndex ? { ...section, ...update } : section));
  };
  const updateTopic = (sectionIndex: number, topicIndex: number, value: string) => {
    setSections((current) => current.map((section, index) => index === sectionIndex
      ? { ...section, topics: section.topics.map((topic, itemIndex) => itemIndex === topicIndex ? value : topic) }
      : section));
  };
  const addTopic = (sectionIndex: number, topicIndex: number) => {
    setSections((current) => current.map((section, index) => index === sectionIndex
      ? { ...section, topics: [...section.topics.slice(0, topicIndex + 1), "", ...section.topics.slice(topicIndex + 1)] }
      : section));
  };
  const updateTask = (taskIndex: number, update: Partial<AssignedTask>) => {
    setAssignedTasks((current) => current.map((task, index) => index === taskIndex ? { ...task, ...update } : task));
  };

  return (
    <ActionForm action={action} className="team-minutes-editor-form">
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="minutesData" value={minutesData} />
      <article className={`minutes-paper minutes-layout-${layout}`} style={{ "--minutes-brand": brandColour || "#b8913f" } as React.CSSProperties}>
        <header className="minutes-paper-header">
          {logoUrl ? <img alt={`${firmName} logo`} src={logoUrl} /> : <span className="minutes-paper-wordmark">{firmName}</span>}
          <span className="minutes-layout-label">{template.name}</span>
        </header>
        <p className="minutes-paper-date">{meetingDate}</p>
        <h2 className="minutes-paper-title">{meetingTitle}</h2>

        <section className="minutes-paper-attendees">
          <h3>Present</h3>
          <div className="minutes-attendee-list">
            {participants.map((participant) => <label className="setup-checkbox-field" key={participant.id}>
              <input type="checkbox" checked={attendingIds.includes(participant.id)} onChange={(event) => setAttendingIds((current) => event.target.checked ? [...current, participant.id] : current.filter((id) => id !== participant.id))} />
              <span>{participant.name}</span>
            </label>)}
          </div>
        </section>

        <section className="minutes-message-week">
          <h3>Message of the week</h3>
          <textarea value={messageOfWeek} onChange={(event) => setMessageOfWeek(event.target.value)} maxLength={500} rows={2} placeholder="A focus or message for the team" />
          <small>{messageOfWeek.length}/500</small>
        </section>

        <section className="minutes-discussions">
          <h3 className="minutes-main-heading">Discussion</h3>
          {sections.map((section, sectionIndex) => <section className="minutes-discussion-section" key={`section-${sectionIndex}`}>
            <input className="minutes-section-heading" aria-label={`Section ${sectionIndex + 1} heading`} value={section.heading} onChange={(event) => updateSection(sectionIndex, { heading: event.target.value })} maxLength={120} placeholder="Section heading" />
            {section.topics.map((topic, topicIndex) => <div className="minutes-topic-row" key={`topic-${topicIndex}`}>
              <span>{sectionIndex + 1}.{topicIndex + 1}</span>
              <textarea aria-label={`${sectionIndex + 1}.${topicIndex + 1} discussion point`} value={topic} onChange={(event) => updateTopic(sectionIndex, topicIndex, event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  addTopic(sectionIndex, topicIndex);
                }
              }} maxLength={2000} rows={2} placeholder="Discussion point. Press Enter for the next numbered point." />
            </div>)}
            <button className="button-secondary minutes-add-topic" type="button" onClick={() => addTopic(sectionIndex, section.topics.length - 1)}>Add discussion point</button>
          </section>)}
          <button className="button-secondary" type="button" onClick={() => setSections((current) => [...current, { heading: "", topics: [""] }])}>Add section</button>
        </section>

        {canAssignTasks ? <section className="minutes-assigned-tasks">
          <h3>Assign a task</h3>
          <p className="foundation-muted">Tasks are added to each assignee’s to-do list and checked in at the next meeting.</p>
          {assignedTasks.map((task, taskIndex) => <div className="minutes-assigned-task" key={`assigned-task-${taskIndex}`}>
            <label className="foundation-field"><span>What needs doing?</span><input value={task.title} onChange={(event) => updateTask(taskIndex, { title: event.target.value })} maxLength={240} required /></label>
            <label className="foundation-field"><span>Who?</span><select value={task.assignedToId} onChange={(event) => updateTask(taskIndex, { assignedToId: event.target.value })}><option value="__all__">Everyone attending</option>{participants.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label className="foundation-field"><span>By when?</span><input type="date" value={task.dueAt} onChange={(event) => updateTask(taskIndex, { dueAt: event.target.value })} required /></label>
            <button className="button-secondary" type="button" onClick={() => setAssignedTasks((current) => current.filter((_, index) => index !== taskIndex))}>Remove</button>
          </div>)}
          <button className="button-secondary" type="button" onClick={() => setAssignedTasks((current) => [...current, { title: "", assignedToId: "__all__", dueAt: "" }])}>Add task</button>
        </section> : null}
      </article>
      <div className="team-minutes-actions">
        <button className="button-secondary" type="button" onClick={() => window.print()}>Print preview</button>
        <SubmitButton>Save minutes{canAssignTasks ? " and tasks" : ""}</SubmitButton>
      </div>
    </ActionForm>
  );
}