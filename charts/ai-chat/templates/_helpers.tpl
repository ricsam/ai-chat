{{- define "ai-chat.name" -}}{{ default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}{{- end }}
{{- define "ai-chat.fullname" -}}{{ default (printf "%s-%s" .Release.Name (include "ai-chat.name" .)) .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}{{- end }}
{{- define "ai-chat.labels" -}}app.kubernetes.io/name: {{ include "ai-chat.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}{{- end }}
{{- define "ai-chat.selectorLabels" -}}app.kubernetes.io/name: {{ include "ai-chat.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}{{- end }}
{{- define "ai-chat.secretName" -}}{{ default (include "ai-chat.fullname" .) .Values.secrets.existingSecret }}{{- end }}
{{- define "ai-chat.databaseUrl" -}}{{- if .Values.secrets.values.databaseUrl -}}{{ .Values.secrets.values.databaseUrl }}{{- else if .Values.postgresql.enabled -}}postgresql://{{ .Values.postgresql.username }}:{{ .Values.postgresql.password }}@{{ include "ai-chat.fullname" . }}-postgresql:5432/{{ .Values.postgresql.database }}{{- end -}}{{- end }}
