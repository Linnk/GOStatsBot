const debug     = require('debug')('csgo')
const pad       = require('pad')
const Telegraf  = require('telegraf')

const { Extra, Markup } = Telegraf
const { HLTV }          = require('hltv')

if (!process.env.GO_STATS_BOT_TOKEN)
{
	debug('Telegram token “GO_STATS_BOT_TOKEN” not found: %s', process.env.GO_STATS_BOT_TOKEN)
	process.exit(1)
}

debug('Starting bot with token %s', process.env.GO_STATS_BOT_TOKEN)

const bot = new Telegraf(process.env.GO_STATS_BOT_TOKEN)

bot.command('start', ({ from, reply }) => {
	debug('start', from)

	return reply('Welcome!')
})

var last_team_searched = null
var last_team_founded = null

bot.command('/go', (ctx) => {
	var team_search = ctx.message.text.replace('/go ', '').toLowerCase()

	var end_date = new Date().toISOString().slice(0, 10)
	var start_date = new Date(new Date() - (3 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10)

	if (last_team_searched === team_search && !last_team_founded)
	{
		return ctx.reply('Ya lo estoy buscando.')
	}
	if (last_team_searched === team_search && last_team_founded)
	{
		return ctx.reply('Lo acabo de publicar. 😒')
	}
	last_team_searched = team_search

	debug('Searching “%s” from %s to %s', team_search, start_date, end_date)
	ctx.reply('Ok. Estoy buscando matches de ' + team_search.toUpperCase() + ' en los últimos 3 días.')

	last_team_founded = false

	HLTV.getMatchesStats({startDate: start_date, endDate: end_date}).then(matches => {
		var matches_found = false

		for (var i = 0; i < matches.length; i++)
		{
			var m = matches[i]

			var team1 = m.team1.name.toLowerCase()
			var team2 = m.team2.name.toLowerCase()

			if (team_search === team1 || team_search === team2)
			{
				debug('%o', m)

				var t1 = m.result.team1 > m.result.team2 ? `*${m.team1.name}*` : m.team1.name
				var t2 = m.result.team2 > m.result.team1 ? `*${m.team2.name}*` : m.team2.name

				matches_found = true

				ctx.replyWithMarkdown(
					`${m.map}:  ${t1} (${m.result.team1}) — ${t2} (${m.result.team2})`,
					Markup.inlineKeyboard([
						Markup.callbackButton('Player Stats', '/stats ' + m.id),
						Markup.urlButton('Abrir en HLTV', `https://www.hltv.org/stats/matches/mapstatsid/${m.id}/${t1}-vs-${t2}`),
					]).extra()
				)
			}
		}

		if (matches_found)
		{
			last_team_founded = true
		}
		else
		{
			last_team_searched = null

			debug('%O', matches)

			ctx.reply(team_search.toUpperCase() + ' no ha jugado recientemente.')
		}
	}).catch(error => {
		console.log(error);
	})
})

var last_stats_searched = null

bot.action(/^\/stats (\d+)$/, (ctx) => {
	var match_id = parseInt(ctx.match[1])
	if (isNaN(match_id))
	{
		ctx.answerCallbackQuery(`Something is wrong: ${ctx.match[0]}`)
	}
	if (last_stats_searched === match_id)
	{
		return ctx.answerCallbackQuery('Lo estoy buscando o lo acabo de publicar. Chill out!');
	}

	last_stats_searched = match_id

	HLTV.getMatchMapStats({id: match_id}).then(res => {
		debug('%O', res)

		var data = [[res.team1.name.toUpperCase(), 'K', 'D']]
		var pads = [data[0][0].length, data[0][1].length, data[0][2].length]

		for (var i = 0, j = 1; i < res.playerStats.team1.length; i++, j++)
		{
			var player = res.playerStats.team1[i];

			data.push([player.name, player.kills.toString(), player.deaths.toString()])

			for (var k = 0; k < pads.length; k++)
			{
				pads[k] = pads[k] > data[j][k].length ? pads[k] : data[j][k].length
			}
		}

		data.push(['', '', ''])
		data.push([res.team2.name.toUpperCase(), ' K', ' D'])

		for (var i = 0, j = 1; i < res.playerStats.team2.length; i++, j++)
		{
			var player = res.playerStats.team2[i];

			data.push([player.name, player.kills.toString(), player.deaths.toString()])

			for (var k = 0; k < pads.length; k++)
			{
				pads[k] = pads[k] > data[j][k].length ? pads[k] : data[j][k].length
			}
		}
		debug('%o', pads)

		var answer = [
			res.event.name,
			res.team1.name + ' ' + res.roundHistory[res.roundHistory.length - 1].score + ' ' + res.team2.name,
			'',
			'```'
		]
		for (var n = 0; n < data.length; n++)
		{
			data[n][0] = pad(data[n][0], pads[0])
			data[n][1] = pad(pads[1], data[n][1])
			data[n][2] = pad(pads[2], data[n][2])

			answer.push(data[n].join('  '))
		}
		answer.push('```')

		ctx.replyWithMarkdown(answer.join('\n'))
	}).catch(function(error){
		console.log(error);
	})
})

bot.startPolling()
