import { player } from './player'
import { post } from './post'
import { match } from './match'
import { team } from './team'
import { coach } from './coach'
import { practice } from './practice'
import { practiceSchedule } from './practiceSchedule'
import { leagueChampionship } from './leagueChampionship'
import { leagueStandings } from './leagueStandings'

export const schema = {
    types: [
        player,
        post,
        match,
        team,
        coach,
        practice,
        practiceSchedule,
        leagueChampionship,
        leagueStandings,
    ],
}
