import config from "@peated/server/config";
import type { Transporter } from "nodemailer";
import { createTransport } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import {
  comments,
  users,
  type Bottle,
  type Comment,
  type Tasting,
  type User,
} from "../db/schema";
import { logError } from "../lib/log";
import { escapeHtml } from "./html";

import theme from "@peated/design";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db";

let mailTransport: Transporter<SMTPTransport.SentMessageInfo>;

type CommentWithRelations = Comment & {
  createdBy: User;
  tasting: Tasting & {
    bottle: Bottle;
    createdBy: User;
  };
};

const hasEmailSupport = () => {
  if (!config.URL_PREFIX) {
    logError("URL_PREFIX is not configured");
    return false;
  }

  if (!config.SMTP_FROM) {
    logError("SMTP_FROM is not configured");
    return false;
  }

  return true;
};

const createMailTransport = () => {
  const user = config.SMTP_USER;
  const auth = user
    ? {
        user,
        pass: config.SMTP_PASS,
      }
    : undefined;

  return createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: true,
    auth,
  } satisfies SMTPTransport.Options);
};

// TODO: this should be an abstraction of the notification system
export async function notifyComment({
  comment,
  transport = mailTransport,
}: {
  comment: CommentWithRelations;
  transport?: Transporter<SMTPTransport.SentMessageInfo>;
}) {
  if (!hasEmailSupport()) return;

  // dont notify self
  if (comment.createdById === comment.tasting.createdById) return;

  const userIds =
    comment.createdById === comment.tasting.createdById
      ? []
      : [comment.tasting.createdById];
  userIds.push(
    ...(
      await db
        .selectDistinct({ id: comments.createdById })
        .from(comments)
        .where(
          and(
            eq(comments.tastingId, comment.tasting.id),
            ne(comments.createdById, comment.tasting.createdById),
            ne(comments.createdById, comment.createdById),
          ),
        )
    ).map((r) => r.id),
  );

  const emailList = (
    await db
      .select({ email: users.email })
      .from(users)
      .where(
        and(
          inArray(users.id, Array.from(new Set(userIds))),
          eq(users.notifyComments, true),
        ),
      )
  ).map((r) => r.email);

  if (!transport) {
    if (!mailTransport) mailTransport = createMailTransport();
    transport = mailTransport;
  }

  const commentUrl = `${config.URL_PREFIX}/tastings/${comment.tasting.id}#c_${comment.id}`;
  const html = buildCommentHtml(comment);

  console.log(
    `Sending email notification for comment ${comment.id} to ${comment.tasting.createdBy.email}`,
  );

  for (const email of emailList) {
    try {
      await transport.sendMail({
        from: `"${config.SMTP_FROM_NAME}" <${config.SMTP_FROM}>`,
        to: comment.tasting.createdBy.email,
        subject: "New Comment on Tasting",
        text: `View this comment on Peated: ${commentUrl}\n\n${comment.comment}`,
        html,
      });
    } catch (err) {
      logError(err);
    }
  }
}

export function buildCommentHtml(comment: CommentWithRelations): string {
  const commentUrl = `${config.URL_PREFIX}/tastings/${comment.tasting.id}#c_${comment.id}`;
  const settingsUrl = `${process.env.BASE_URL}/settings`;

  const titleLine = `${escapeHtml(
    comment.createdBy.displayName || comment.createdBy.email,
  )} commented on your tasting`;
  const reasonLine = `You are being notified because you are subscribed to comments. <a href="${settingsUrl}" style="color:${theme.colors.highlight}">Settings</a>`;

  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <title>New Comment</title>
      <meta http-equiv="Content-Type" content="text/html charset=UTF-8" />
    </head>
    <body style="background:${theme.colors.background}">
      <h2 style="margin-top:0;margin-bottom:15px;color:${
        theme.colors.highlight
      };">${titleLine}</h2>
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align:top"><img src="${config.URL_PREFIX}${
            comment.createdBy.pictureUrl || `/img/placeholder-avatar.png`
          }" width="36" height="36" style="border-radius:36px;display:block;" /></td>
          <td style="padding-left:15px">
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td><b style="color:${theme.colors.highlight};">${escapeHtml(
                  comment.createdBy.displayName || comment.createdBy.username,
                )}</b></td>
              </tr>
              <tr>
              <td style="color:${theme.colors.light};">${escapeHtml(
                comment.comment,
              )}</td>
            </tr>
            <tr>
              <td style="padding-top:15px;"><a href="${commentUrl}" style="color:${
                theme.colors.highlight
              };">View this Comment</a></td>
            </tr>
            </table>
        </tr>
      </table>
      <p style="color:${theme.colors.light};margin:15px 0 0;">${reasonLine}</p>
    </body>
  </html>
  `;
}
